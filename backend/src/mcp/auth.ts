import { teamContext, type ServiceContext, type TeamPermission } from "@/services/context"
import type { DbType } from "@db/db"
import {
  bearerAuthChallengeResponse,
  OAuthError,
  OAuthErrorCode,
  verifyBearerToken,
  type AuthInfo,
  type CallToolResult,
} from "@modelcontextprotocol/server"

import { isAuthConfigured, mcpConfig, SCOPES } from "./config"
import { verify } from "./oauth/crypto"
import { MembershipCheckError } from "./oauth/directory"
import { teamPermissions } from "./oauth/team"
import { signInWith } from "./settings"

// Resource server side: verifies access tokens and turns them into team access for the protected tools

interface AccessTokenClaims {
  sub: string
  email: string
  name?: string | null
  client_id: string
  scope: string
  exp: number
  aud: string
  // Local sign-in: when the user signed in, in milliseconds (oauth/team.ts)
  auth_time_ms?: number
  [claim: string]: unknown
}

export interface LumiAuthExtra {
  sub: string
  email: string
  name: string | null
  signedInAt?: number
  [key: string]: unknown
}

const verifier = {
  // Signature, type, issuer, audience (this MCP resource) and expiry
  async verifyAccessToken(token: string): Promise<AuthInfo> {
    try {
      const claims = await verify<AccessTokenClaims>("access_token", token, mcpConfig.resource)
      return {
        token,
        clientId: claims.client_id,
        scopes: claims.scope.split(" ").filter(Boolean),
        expiresAt: claims.exp,
        resource: new URL(claims.aud),
        extra: {
          sub: claims.sub,
          email: claims.email,
          name: claims.name ?? null,
          ...(typeof claims.auth_time_ms === "number" && { signedInAt: claims.auth_time_ms }),
        } satisfies LumiAuthExtra,
      }
    } catch {
      throw new OAuthError(OAuthErrorCode.InvalidToken, "The access token is invalid or expired.")
    }
  },
}

// Requests without a token are anonymous: discovery and public tools work, protected tools answer with a sign-in challenge.
// A token that is present must be valid; otherwise the whole request gets a 401 challenge
export async function authenticate(request: Request): Promise<{ authInfo?: AuthInfo; response?: Response }> {
  const header = request.headers.get("authorization")
  if (!header) return {}

  const options = { verifier, expectedResource: new URL(mcpConfig.resource), resourceMetadataUrl: mcpConfig.resourceMetadataUrl }
  try {
    if (!isAuthConfigured()) throw new OAuthError(OAuthErrorCode.InvalidToken, "Sign-in is not configured on this server.")
    return { authInfo: await verifyBearerToken(header, options) }
  } catch (error) {
    return { response: bearerAuthChallengeResponse(error, { resourceMetadataUrl: mcpConfig.resourceMetadataUrl }) }
  }
}

const quote = (value: string) => value.replace(/["\\]/g, "")

// Tool-level challenge (ChatGPT's mcp/www_authenticate): asks the client to link or re-authorize with the needed scopes
function challenge(scopes: string[], description: string, error = "insufficient_scope"): CallToolResult {
  return {
    content: [{ type: "text", text: description }],
    isError: true,
    _meta: {
      "mcp/www_authenticate": [
        `Bearer resource_metadata="${mcpConfig.resourceMetadataUrl}", error="${error}", scope="${scopes.join(" ")}", error_description="${quote(description)}"`,
      ],
    },
  }
}

function failure(code: string, message: string): CallToolResult {
  return { content: [{ type: "text", text: JSON.stringify({ error: { code, message } }) }], isError: true }
}

// Team access for one protected tool call. Checked on every call: the token's scopes (lumi:write includes lumi:read) and the
// account's current team permissions (oauth/team.ts): its membership of the team groups, or for local sign-in that the admin
// account still exists without a password change since the sign-in. Signing in alone grants nothing
export async function teamAccess(
  db: DbType,
  authInfo: AuthInfo | undefined,
  required: TeamPermission
): Promise<{ ctx: ServiceContext; result?: undefined } | { ctx?: undefined; result: CallToolResult }> {
  const scopes = required === "write" ? [SCOPES.read, SCOPES.write] : [SCOPES.read]

  if (!isAuthConfigured()) return { result: failure("unavailable", "Team sign-in is not configured on this Lumi server.") }
  if (!authInfo) return { result: challenge(scopes, `Sign in with ${signInWith(mcpConfig.authProvider)} to use this tool.`) }

  const tokenAllows = {
    read: authInfo.scopes.includes(SCOPES.read) || authInfo.scopes.includes(SCOPES.write),
    write: authInfo.scopes.includes(SCOPES.write),
  }
  if (!tokenAllows[required]) {
    return {
      result: challenge(scopes, `This tool needs the ${required === "write" ? SCOPES.write : SCOPES.read} permission. Reconnect Lumi to grant it.`),
    }
  }

  const user = authInfo.extra as LumiAuthExtra
  const local = mcpConfig.authProvider === "local"
  let membership
  try {
    membership = await teamPermissions(db, { sub: user.sub, signedInAt: user.signedInAt })
  } catch (error) {
    if (error instanceof MembershipCheckError) {
      return {
        result: failure("unavailable", `${local ? "Your admin account" : "Team membership"} could not be verified. Try again in a moment.`),
      }
    }
    throw error
  }

  const permissions = (["read", "write"] as const).filter((permission) => tokenAllows[permission] && membership[permission])
  if (!permissions.includes(required)) {
    // Every admin account may read and write, so a local user without access has a sign-in that ended: asked to connect again
    if (local) {
      return {
        result: challenge(
          scopes,
          "Your Lumi sign-in has ended because your admin password was changed or reset, or your account was removed. Connect Lumi again and sign in with your current password.",
          "invalid_token"
        ),
      }
    }
    return { result: failure("forbidden", `Your account does not have ${required} access to Lumi records. Ask a Lumi admin for access.`) }
  }

  return { ctx: teamContext(db, { sub: user.sub, email: user.email, name: user.name, clientId: authInfo.clientId }, permissions) }
}
