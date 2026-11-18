import { consumeRateLimit } from "@/services/rateLimit"
import type { DbType } from "@db/db"

import { authenticate } from "./auth"
import { isAuthConfigured, mcpConfig } from "./config"
import { json, oauthError, SOURCE_IP_HEADER } from "./http"
import { authorizationServerMetadata, handleOAuthRequest, protectedResourceMetadata } from "./oauth/server"
import { serveMcp } from "./server"

// Routes of the MCP server's HTTP endpoint:
// - /mcp: Streamable HTTP MCP endpoint (POST; GET and DELETE answer 405 in stateless mode)
// - /.well-known/oauth-protected-resource[/mcp]: protected resource metadata (RFC 9728)
// - /.well-known/oauth-authorization-server: authorization server metadata (RFC 8414)
// - /oauth/*: the authorization server (see oauth/server.ts)

// Discovery documents are public and may be read from browsers (e.g. the MCP Inspector)
const DISCOVERY_HEADERS = { "Access-Control-Allow-Origin": "*", "Cache-Control": "public, max-age=300" }

function rateLimited(retryAfterSeconds: number, jsonRpc: boolean) {
  const headers = { "Retry-After": String(retryAfterSeconds) }
  return jsonRpc
    ? json({ jsonrpc: "2.0", id: null, error: { code: -32000, message: "Too many requests. Wait a minute and try again." } }, 429, headers)
    : oauthError("too_many_requests", "Too many requests. Wait a minute and try again.", 429, headers)
}

async function dispatch(db: DbType, request: Request): Promise<Response> {
  const url = new URL(request.url)
  const sourceIp = request.headers.get(SOURCE_IP_HEADER) || "unknown"

  if (
    request.method === "GET" &&
    (url.pathname === "/.well-known/oauth-protected-resource" || url.pathname === "/.well-known/oauth-protected-resource/mcp")
  ) {
    // Without sign-in configured the server is anonymous only, so it advertises no authorization server
    return isAuthConfigured() ? json(protectedResourceMetadata(), 200, DISCOVERY_HEADERS) : json({ error: "Not found" }, 404)
  }
  if (request.method === "GET" && url.pathname === "/.well-known/oauth-authorization-server") {
    return isAuthConfigured() ? json(authorizationServerMetadata(), 200, DISCOVERY_HEADERS) : json({ error: "Not found" }, 404)
  }

  if (url.pathname.startsWith("/oauth/")) {
    // The token endpoint is called by the clients' servers (ChatGPT's for every user), the other endpoints by browsers
    const [kind, perMinute] =
      url.pathname === "/oauth/register"
        ? ["register", mcpConfig.rateLimits.registrationsPerMinute]
        : url.pathname === "/oauth/token"
          ? ["token", mcpConfig.rateLimits.tokenPerMinute]
          : ["oauth", mcpConfig.rateLimits.oauthPerMinute]
    const limit = await consumeRateLimit(db, `${kind}:${sourceIp}`, perMinute)
    if (!limit.allowed) return rateLimited(limit.retryAfterSeconds, false)

    return (await handleOAuthRequest(db, request, url)) ?? json({ error: "Not found" }, 404)
  }

  if (url.pathname === "/mcp") {
    const { authInfo, response } = await authenticate(request)
    if (response) return response

    // Anonymous callers are counted per address. ChatGPT calls from a few shared addresses for all of its users, so that limit
    // is sized for many users behind one address; the gateway throttling caps the total
    const sub = (authInfo?.extra as { sub?: string } | undefined)?.sub
    const limit = await consumeRateLimit(
      db,
      sub ? `user:${sub}` : `ip:${sourceIp}`,
      sub ? mcpConfig.rateLimits.userPerMinute : mcpConfig.rateLimits.anonymousPerMinute
    )
    if (!limit.allowed) return rateLimited(limit.retryAfterSeconds, true)

    return serveMcp(db, request, authInfo)
  }

  return json({ error: "Not found" }, 404)
}

export async function route(db: DbType, request: Request): Promise<Response> {
  try {
    return await dispatch(db, request)
  } catch (error) {
    console.error("[MCP]: Error handling request", request.method, new URL(request.url).pathname, error)
    return json({ error: "An error occurred." }, 500)
  }
}
