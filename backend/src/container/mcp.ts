import { Readable } from "node:stream"
import { SOURCE_IP_HEADER } from "@/services/rateLimit"
import { createDb } from "@/utils/db-setup"

import { servicePort } from "./config"
import { createHealthCheck } from "./health"
import { handleShutdown, pathOf, sendHealth, SERVICE_POOL_OPTIONS, sourceIp, startServer, webHeaders } from "./server"

// The container's MCP server and its authorization server, in place of the HTTP API and the MCP Lambda: the same router
// (src/mcp/router.ts) on the installation's public origin (MCP_BASE_URL), which the reverse proxy forwards /mcp, /oauth/* and
// /.well-known/oauth-* of to it. Its configuration comes from the environment; the Lambda's SSM secrets (MCP_SECRET_PARAMETERS)
// don't apply. GET /health is unauthenticated (health.ts)

export async function startMcp() {
  // The router reads its configuration when its modules load, after the environment has been checked
  const { route } = await import("@/mcp/router")
  const db = await createDb("lumi-mcp", SERVICE_POOL_OPTIONS)
  const checkHealth = createHealthCheck("lumi-mcp")
  const baseUrl = process.env.MCP_BASE_URL!.trim()

  const server = startServer("mcp", servicePort("mcp"), async (req, res) => {
    if (pathOf(req) === "/health" && req.method === "GET") {
      await sendHealth(res, checkHealth)
      return
    }

    const headers = webHeaders(req)
    // Never taken from the client
    headers.delete(SOURCE_IP_HEADER)
    headers.set(SOURCE_IP_HEADER, sourceIp(req))

    const method = req.method || "GET"
    const hasBody = method !== "GET" && method !== "HEAD"
    // Streamed, so the router's own body limits apply as it reads
    const request = new Request(new URL(req.url || "/", baseUrl), {
      method,
      headers,
      body: hasBody ? (Readable.toWeb(req) as ReadableStream) : undefined,
      duplex: "half",
    } as RequestInit)

    const response = await route(db, request)
    const responseHeaders: Record<string, string | string[]> = {}
    response.headers.forEach((value, name) => {
      if (name !== "set-cookie") responseHeaders[name] = value
    })
    const cookies = response.headers.getSetCookie()
    if (cookies.length) responseHeaders["set-cookie"] = cookies

    // MCP runs stateless with JSON responses, so they are buffered as in Lambda
    const body = Buffer.from(await response.arrayBuffer())
    res.writeHead(response.status, responseHeaders)
    res.end(body)
  })

  handleShutdown("mcp", server, () => db.$client.end())
}
