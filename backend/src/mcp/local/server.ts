import "dotenv/config"

import http from "node:http"
import { Readable } from "node:stream"

// Local stand-in for the HTTP API and the MCP Lambda: serves the same router on http://localhost:<MCP_PORT>

process.env.NODE_ENV ||= "development"
const port = parseInt(process.env.MCP_PORT || "4300")
process.env.MCP_BASE_URL ||= `http://localhost:${port}`
// Local MCP clients such as the MCP Inspector redirect to localhost
process.env.MCP_ALLOW_LOOPBACK_REDIRECTS ||= "true"

;(async () => {
  // Imported after the environment defaults are set: the configuration is read when the modules load
  const [{ createDb }, { route }, { SOURCE_IP_HEADER }] = await Promise.all([import("@/utils/db-setup"), import("../router"), import("../http")])
  const db = await createDb("lumi-mcp-local")

  const server = http.createServer(async (req, res) => {
    try {
      const headers = new Headers()
      for (const [name, value] of Object.entries(req.headers)) {
        if (value !== undefined) headers.set(name, Array.isArray(value) ? value.join(", ") : value)
      }
      headers.set(SOURCE_IP_HEADER, req.socket.remoteAddress || "local")

      const hasBody = req.method !== "GET" && req.method !== "HEAD"
      const request = new Request(new URL(req.url || "/", process.env.MCP_BASE_URL), {
        method: req.method,
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

      res.writeHead(response.status, responseHeaders)
      res.end(Buffer.from(await response.arrayBuffer()))
    } catch (error) {
      console.error("Error handling local MCP request", error)
      if (!res.headersSent) res.writeHead(500, { "Content-Type": "application/json" })
      res.end()
    }
  })

  server.listen(port, () => {
    console.log(`🚀  MCP server ready at: ${process.env.MCP_BASE_URL}/mcp`)
  })
})()
