import type { Writable } from "node:stream"
import { SOURCE_IP_HEADER } from "@/services/rateLimit"
import type { AgentsErrorResponse, LimitCode } from "@lumi/shared-contracts/pre-sales"
import type { APIGatewayProxyEvent } from "aws-lambda"
import { z } from "zod"

// The agents API is a REST API Gateway with ResponseTransferMode.STREAM in front of a response-streaming Lambda:
// - API Gateway only streams responses on REST APIs. The HTTP API that serves /graphql buffers responses and caps them at 30 s.
// - The REST endpoint is regional: edge-optimized endpoints drop a stream after 30 s of silence, regional ones after 5 min.
// - STREAM disables VTL transformations of the integration response, so the function emits its own CORS headers and the gateway
//   only answers OPTIONS. The errors the gateway answers itself (throttling, a failed invocation) come from its gateway
//   responses instead, which the deployment configures to add CORS headers for the app's origin and the same { error, code? }
//   body.
// - The status code is fixed on the first body byte, so validation and auth happen before a Response is returned.
// - Lambda does not stop a streaming function when the client disconnects. A failed write is the only signal, so every write is
//   awaited and a failure aborts the graph run through an AbortSignal.

// While the model or a tool is silent a keep-alive is written so the gateway does not drop the stream and a disconnect is noticed
const KEEP_ALIVE_INTERVAL_MS = 5000

export const ALLOWED_METHODS = "GET, POST, OPTIONS"
export const ALLOWED_HEADERS = "Content-Type"

function allowedOrigins() {
  return (process.env.AGENTS_ALLOWED_ORIGINS || "")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean)
}

export function corsHeaders(origin: string | null): Record<string, string> {
  const headers: Record<string, string> = { Vary: "Origin" }

  if (origin && allowedOrigins().includes(origin)) {
    headers["Access-Control-Allow-Origin"] = origin
  }

  return headers
}

// The answer to a CORS preflight, which API Gateway gives in AWS and the local and container servers give themselves
export function preflightHeaders(origin: string | null): Record<string, string> {
  return {
    ...corsHeaders(origin),
    "Access-Control-Allow-Methods": ALLOWED_METHODS,
    "Access-Control-Allow-Headers": ALLOWED_HEADERS,
    "Access-Control-Max-Age": "600",
  }
}

export function json(body: unknown, status = 200, headers?: HeadersInit) {
  return Response.json(body, { status, headers })
}

export function errorResponse(status: number, message: string) {
  return json({ error: message } satisfies AgentsErrorResponse, status)
}

// The answer to a request refused by one of the public routes' limits, with the code the chat explains it by. A rate limit also
// says when to try again, in the body and the Retry-After header
export function limitResponse(status: number, code: LimitCode, message: string, retryAfterSeconds?: number) {
  const body: AgentsErrorResponse = { error: message, code, ...(retryAfterSeconds !== undefined && { retryAfterSeconds }) }
  return json(body, status, retryAfterSeconds !== undefined ? { "Retry-After": String(retryAfterSeconds) } : undefined)
}

// Builds a web Request from a REST API proxy event. Aborting the signal cancels whatever the handler is running
export function toWebRequest(event: APIGatewayProxyEvent, signal: AbortSignal) {
  const headers = new Headers()
  for (const [name, values] of Object.entries(event.multiValueHeaders ?? {})) {
    values?.forEach((value) => headers.append(name, value))
  }
  for (const [name, value] of Object.entries(event.headers ?? {})) {
    if (value !== undefined && !headers.has(name)) {
      headers.set(name, value)
    }
  }

  // The caller's address, which the public routes' rate limits count by, comes from the connection only, never from a client
  // header
  headers.delete(SOURCE_IP_HEADER)
  const sourceIp = event.requestContext?.identity?.sourceIp
  if (sourceIp) headers.set(SOURCE_IP_HEADER, sourceIp)

  const url = new URL(event.path, `https://${headers.get("host") || "localhost"}`)
  for (const [name, values] of Object.entries(event.multiValueQueryStringParameters ?? {})) {
    values?.forEach((value) => url.searchParams.append(name, value))
  }
  for (const [name, value] of Object.entries(event.queryStringParameters ?? {})) {
    if (value !== undefined && !url.searchParams.has(name)) {
      url.searchParams.set(name, value)
    }
  }

  const hasBody = event.body !== null && event.httpMethod !== "GET" && event.httpMethod !== "HEAD"

  return new Request(url, {
    method: event.httpMethod,
    headers,
    body: hasBody ? Buffer.from(event.body!, event.isBase64Encoded ? "base64" : "utf8") : undefined,
    signal,
  })
}

// A client disconnect surfaces as an error or an early close on the response stream
export function abortOnClientDisconnect(responseStream: Writable, controller: AbortController) {
  responseStream.on("error", (error) => controller.abort(error))
  responseStream.on("close", () => {
    if (!responseStream.writableFinished) {
      controller.abort(new Error("Response stream closed before the response was complete"))
    }
  })
}

function write(stream: Writable, chunk: Uint8Array | string) {
  return new Promise<void>((resolve, reject) => {
    if (stream.destroyed) {
      reject(new Error("Response stream destroyed"))
      return
    }
    stream.write(chunk, (error) => (error ? reject(error) : resolve()))
  })
}

function end(stream: Writable) {
  return new Promise<void>((resolve) => {
    if (stream.destroyed || stream.writableEnded) {
      resolve()
      return
    }
    stream.end(() => resolve())
  })
}

// SSE comments and blank NDJSON lines are ignored by the clients, other content types get no keep-alive
function keepAliveChunk(contentType: string | null) {
  if (contentType?.startsWith("text/event-stream")) return ": keep-alive\n\n"
  if (contentType?.startsWith("application/x-ndjson")) return "\n"
  return undefined
}

function waitFor(ms: number) {
  let timer: NodeJS.Timeout | undefined
  const promise = new Promise<"timeout">((resolve) => {
    timer = setTimeout(() => resolve("timeout"), ms)
  })

  return { promise, clear: () => clearTimeout(timer) }
}

export function headersOf(response: Response) {
  const headers: Record<string, string> = {}
  response.headers.forEach((value, name) => {
    headers[name] = value
  })
  return headers
}

// Writes a web Response to the Lambda response stream. Every write is awaited; a failed write aborts the request
export async function writeResponse(response: Response, responseStream: Writable, controller: AbortController) {
  const stream = awslambda.HttpResponseStream.from(responseStream, { statusCode: response.status, headers: headersOf(response) })
  await writeBody(response, stream, controller)
}

// Writes a web Response's body to a stream whose status and headers are already set: the Lambda response stream, or the
// container server's response. Every write is awaited; a failed write aborts the request
export async function writeBody(response: Response, stream: Writable, controller: AbortController) {
  if (!response.body) {
    // The status and headers are sent with the first write, so a body is always written
    await write(stream, "").catch(() => undefined)
    await end(stream)
    return
  }

  const keepAlive = keepAliveChunk(response.headers.get("content-type"))
  const reader = response.body.getReader()

  try {
    let pendingRead = reader.read()

    while (true) {
      const timeout = waitFor(KEEP_ALIVE_INTERVAL_MS)
      const result = await Promise.race([pendingRead, timeout.promise])
      timeout.clear()

      if (result === "timeout") {
        if (keepAlive) {
          await write(stream, keepAlive)
        }
        continue
      }

      if (result.done) break

      await write(stream, result.value)
      pendingRead = reader.read()
    }

    await end(stream)
  } catch (error) {
    console.warn("Response stream interrupted, aborting the request", error)
    controller.abort(error)
    await reader.cancel(error).catch(() => undefined)
    stream.destroy()
  }
}

type ParseResult<T> = { success: true; data: T } | { success: false; response: Response }

// Parses and validates a JSON body; invalid input becomes a 400 before any stream starts
export async function readJson<T>(request: Request, schema: z.ZodType<T>): Promise<ParseResult<T>> {
  const body = await request.json().catch(() => undefined)
  const result = schema.safeParse(body)

  if (!result.success) {
    return { success: false, response: errorResponse(400, `Invalid request: ${z.prettifyError(result.error)}`) }
  }

  return { success: true, data: result.data }
}
