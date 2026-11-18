import type { IncomingMessage } from "node:http"
import { abortOnClientDisconnect, errorResponse, headersOf, preflightHeaders, writeBody } from "@/ai/agents/http"
import { route } from "@/ai/agents/router"
import { flushTraces } from "@/ai/tracing"
import AwsDataSource from "@/apollo/sources/aws"
import DbDataSource from "@/apollo/sources/dbDataSource"
import GCalendarSource from "@/apollo/sources/gCalendar"
import EmbeddingSource from "@/apollo/sources/vectorStore"
import { SOURCE_IP_HEADER } from "@/services/rateLimit"
import { createDb } from "@/utils/db-setup"

import { servicePort } from "./config"
import { createHealthCheck } from "./health"
import { handleShutdown, pathOf, readBody, sendHealth, sendJson, SERVICE_POOL_OPTIONS, sourceIp, startServer, webHeaders } from "./server"

// The container's agents API, in place of the API Gateway REST API and the streaming agents Lambda (src/ai/agents/http.ts). It
// runs the same router on web Requests built straight from Node's: /agents/* is public, with CORS for AGENTS_ALLOWED_ORIGINS,
// /admin/* needs the API key (checked by the router), and OPTIONS preflights are answered here as API Gateway does in AWS.
// Responses stream unbuffered, and a client that disconnects aborts its run. GET /health is unauthenticated (health.ts)

const ROOT_RESOURCES = ["agents", "admin"]

function toWebRequest(req: IncomingMessage, body: Buffer, signal: AbortSignal) {
  const headers = webHeaders(req)
  // The public routes' rate limits count by the caller's address, never taken from the client
  headers.delete(SOURCE_IP_HEADER)
  headers.set(SOURCE_IP_HEADER, sourceIp(req))
  const method = req.method || "GET"
  const hasBody = body.length > 0 && method !== "GET" && method !== "HEAD"
  return new Request(new URL(req.url || "/", `http://${req.headers.host || "localhost"}`), {
    method,
    headers,
    body: hasBody ? new Uint8Array(body) : undefined,
    signal,
  })
}

export async function startAgents() {
  const db = await createDb("lumi-agents", SERVICE_POOL_OPTIONS)
  const checkHealth = createHealthCheck("lumi-agents")

  const server = startServer("agents", servicePort("agents"), async (req, res) => {
    const path = pathOf(req)
    const [root] = path.split("/").filter(Boolean)

    // Token writes must not be coalesced
    req.socket.setNoDelay(true)

    if (req.method === "OPTIONS") {
      res.writeHead(204, preflightHeaders(req.headers.origin ?? null))
      res.end()
      return
    }
    if (path === "/health" && req.method === "GET") {
      await sendHealth(res, checkHealth)
      return
    }
    if (!ROOT_RESOURCES.includes(root)) {
      sendJson(res, 404, { error: "Not found" })
      return
    }

    const controller = new AbortController()
    abortOnClientDisconnect(res, controller)

    const body = await readBody(req)
    let response: Response
    try {
      const request = toWebRequest(req, body, controller.signal)
      response = await route(request, {
        db: new DbDataSource(db),
        drizzle: db,
        pool: db.$client,
        embeddings: new EmbeddingSource(db.$client),
        gCalendar: new GCalendarSource(),
        aws: new AwsDataSource(),
        signal: controller.signal,
      })
    } catch (error) {
      console.error("Error preparing agents request", error)
      response = errorResponse(500, "An error occurred.")
    }

    res.writeHead(response.status, headersOf(response))
    res.flushHeaders()
    await writeBody(response, res, controller)
  })

  // Traces are exported in batches while the server runs; the last are flushed once the open conversations have ended
  handleShutdown("agents", server, () => Promise.all([flushTraces(), db.$client.end()]))
}
