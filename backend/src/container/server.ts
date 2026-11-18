import http, { type IncomingMessage, type ServerResponse } from "node:http"
import type { ApiAccess } from "@/authorizers/apiAccess"
import { isApiKey } from "@/authorizers/apikey"
import { resolveApiAccess } from "@/authorizers/roles"
import type { DbType } from "@db/db"

import type { createHealthCheck } from "./health"

// What the api, agents and worker servers share: the pool settings, request helpers, GET /health and a graceful shutdown. The
// local tasks server (src/tasks/local/server.ts) serves and shuts down with them too

// A long-lived pool: connections stay open between requests, and connecting or waiting for a free one gives up rather than
// hang a request while the database is down
export const SERVICE_POOL_OPTIONS = { max: 10, idleTimeoutMillis: 30_000, connectionTimeoutMillis: 10_000, keepAlive: true }

// Requests are JSON; the GraphQL API's largest are well under this, as the AWS API Gateway caps them at 10 MB
export const MAX_BODY_BYTES = 10 * 1024 * 1024

export class BodyTooLargeError extends Error {}

export async function readBody(req: IncomingMessage, limit = MAX_BODY_BYTES) {
  const chunks: Buffer[] = []
  let size = 0
  for await (const chunk of req) {
    size += (chunk as Buffer).length
    if (size > limit) throw new BodyTooLargeError(`Request body larger than ${limit} bytes`)
    chunks.push(chunk as Buffer)
  }
  return Buffer.concat(chunks)
}

export function sendJson(res: ServerResponse, status: number, body: unknown, headers: Record<string, string> = {}) {
  res.writeHead(status, { "Content-Type": "application/json", "Cache-Control": "no-store", ...headers })
  res.end(JSON.stringify(body))
}

// The installation's own API key, sent raw in the Authorization header as the web app does. The worker's routes take no other
export const isAuthorized = (req: IncomingMessage) => isApiKey(req.headers.authorization)

// Set by the bundled Caddy proxy (deploy/) on the requests it forwards from outside, replacing any value the client sent
const PROXIED_HEADER = "x-lumi-proxied"

// Whether the proxy forwarded the request from outside, rather than it coming from the private network
export const isProxied = (req: IncomingMessage) => req.headers[PROXIED_HEADER] !== undefined

// The access of the API key in the Authorization header (src/authorizers/roles.ts): the installation's own key or an active
// generated one, or null when there is none. The installation's own key only works on the private network: a request the
// proxy forwarded from outside is refused it, so it can't be used from the internet even if it leaks. A generated key is looked
// up on every request, so one revoked is refused at once
export async function apiAccess(req: IncomingMessage, getDb: () => Promise<DbType>): Promise<ApiAccess | null> {
  const access = await resolveApiAccess(req.headers.authorization, getDb)
  if (access?.role === "internal" && isProxied(req)) return null
  return access
}

export async function sendHealth(res: ServerResponse, checkHealth: ReturnType<typeof createHealthCheck>) {
  const health = await checkHealth()
  sendJson(res, health.status === "ok" ? 200 : 503, health)
}

// The request's headers as web Headers, for the routers that take a web Request. Node already joins repeated headers into
// one value, except Set-Cookie, whose values are appended one by one
export function webHeaders(req: IncomingMessage) {
  const headers = new Headers()
  for (const [name, value] of Object.entries(req.headers)) {
    if (value === undefined) continue
    for (const entry of Array.isArray(value) ? value : [value]) headers.append(name, entry)
  }
  return headers
}

// The caller's address, which the MCP router's, the public agents routes' and the api's proxied requests' rate limits count
// by: the first X-Forwarded-For entry, which the reverse proxy in front sets to the connection's address (Caddy replaces any
// the client sent), else the connection's own address. The port must only be reachable through that proxy, or a client could
// choose its own address
export function sourceIp(req: IncomingMessage) {
  const forwarded = req.headers["x-forwarded-for"]
  const first = (Array.isArray(forwarded) ? forwarded[0] : forwarded)?.split(",")[0]?.trim()
  // An IPv4 client reads as an IPv4-mapped IPv6 address on a dual-stack socket, and as plain IPv4 in Lambda
  return first || req.socket.remoteAddress?.replace(/^::ffff:(?=\d+\.\d+\.\d+\.\d+$)/, "") || "unknown"
}

// How often an address rate limit drops the windows that have ended
const RATE_LIMIT_SWEEP_MS = 60_000

// A fixed-window limit of `limit` requests per `windowSeconds` for each address, kept in this process's memory: for a server
// that runs as a single process, and checks that must not query the database. Windows that have ended are dropped every minute,
// so the map holds at most the addresses seen in the current window. Counts a request and answers whether it is allowed
export function createAddressRateLimit(limit: number, windowSeconds: number) {
  const windowMs = windowSeconds * 1000
  const windows = new Map<string, { start: number; count: number }>()

  const sweep = setInterval(() => {
    const current = Math.floor(Date.now() / windowMs) * windowMs
    for (const [address, window] of windows) {
      if (window.start < current) windows.delete(address)
    }
  }, RATE_LIMIT_SWEEP_MS)
  sweep.unref()

  return (address: string) => {
    const now = Date.now()
    const start = Math.floor(now / windowMs) * windowMs
    let window = windows.get(address)
    if (!window || window.start !== start) {
      window = { start, count: 0 }
      windows.set(address, window)
    }
    window.count++
    return { allowed: window.count <= limit, retryAfterSeconds: Math.max(1, Math.ceil((start + windowMs - now) / 1000)) }
  }
}

export const pathOf = (req: IncomingMessage) => new URL(req.url || "/", "http://localhost").pathname.replace(/\/+$/, "") || "/"

type RequestHandler = (req: IncomingMessage, res: ServerResponse) => Promise<void>

// Serves the handler on the port, answering 500 for anything it throws before responding
export function startServer(name: string, port: number, handler: RequestHandler): http.Server {
  const server = createHttpServer(handler)
  server.listen(port, () => console.log(`Lumi ${name} listening on port ${port}`))
  return server
}

// The server startServer listens with, for one that listens on its own address (the local tasks server, src/tasks/local)
export function createHttpServer(handler: RequestHandler): http.Server {
  const server = http.createServer((req, res) => {
    handler(req, res).catch((error: unknown) => {
      console.error(`Error handling ${req.method} ${pathOf(req)}`, error)
      if (!res.headersSent) {
        const tooLarge = error instanceof BodyTooLargeError
        // The rest of a body that is too large is never read, so the connection can't carry another request: closing it says so,
        // rather than the reverse proxy sending its next request on it and getting a reset
        sendJson(res, tooLarge ? 413 : 500, { error: tooLarge ? error.message : "An error occurred." }, tooLarge ? { Connection: "close" } : {})
      } else {
        res.destroy()
      }
    })
  })

  // Longer than a reverse proxy keeps an idle upstream connection, so the proxy never reuses one Node has just closed
  server.keepAliveTimeout = 65_000
  server.headersTimeout = 66_000

  return server
}

// How long a shutdown waits for requests and background work before exiting anyway. Docker kills the container 10 s after
// SIGTERM unless its stop_grace_period is longer: deploy/compose.services.yaml gives the backend services 30 s
const SHUTDOWN_TIMEOUT_MS = 25_000

// While connections drain, idle kept-alive ones are closed this often, so a client's next request goes to a new container
const IDLE_SWEEP_MS = 500

// On SIGTERM or SIGINT: runs `onSignal` at once (e.g. to stop starting background work), stops accepting connections, waits
// for open requests to finish, then runs `cleanUp` (e.g. waiting for background work, closing the pool) and exits. The pool
// stays open while requests still use it
export function handleShutdown(name: string, server: http.Server, cleanUp: () => Promise<unknown>, onSignal?: () => void) {
  let shuttingDown = false

  const shutdown = async (signal: string) => {
    if (shuttingDown) return
    shuttingDown = true
    console.log(`Lumi ${name}: ${signal} received, shutting down`)

    const timer = setTimeout(() => {
      console.warn(`Lumi ${name}: shutdown took longer than ${SHUTDOWN_TIMEOUT_MS / 1000} s, exiting`)
      process.exit(0)
    }, SHUTDOWN_TIMEOUT_MS)
    timer.unref()

    onSignal?.()

    const closed = new Promise<void>((resolve) => server.close(() => resolve()))
    const idleSweep = setInterval(() => server.closeIdleConnections(), IDLE_SWEEP_MS)
    idleSweep.unref()
    server.closeIdleConnections()
    await closed
    clearInterval(idleSweep)

    await cleanUp().catch((error) => console.error("Error shutting down", error))
    process.exit(0)
  }

  process.on("SIGTERM", () => void shutdown("SIGTERM"))
  process.on("SIGINT", () => void shutdown("SIGINT"))
}
