import { lookup } from "node:dns"
import http, { type IncomingMessage } from "node:http"
import https from "node:https"
import net, { type LookupFunction } from "node:net"
import zlib from "node:zlib"

// Fetches public web content on behalf of a caller-supplied URL without exposing internal services (SSRF):
// - Only http(s) on the default ports, no credentials in the URL, and no cookies or authorization headers are ever sent.
// - Every address a host resolves to must be public; the connection uses the address that was checked (no DNS rebinding).
//   IP literals are checked the same way.
// - Redirects are followed manually, up to a limit, and each hop is checked again.
// - Time, response size (also after decompression) and content types are bounded.
// safePost sends data to a caller-supplied URL, such as a webhook, with the same destination checks and no redirects.

export class SafeFetchError extends Error {
  constructor(
    message: string,
    readonly reason: "invalid_url" | "blocked_destination" | "timeout" | "too_large" | "unsupported_content" | "http_error" | "network_error",
    // The HTTP status of an http_error the server answered with, such as 404
    readonly status?: number
  ) {
    super(message)
    this.name = "SafeFetchError"
  }
}

export interface SafeFetchOptions {
  timeoutMs?: number
  maxBytes?: number
  maxRedirects?: number
  // Lowercase media types accepted, e.g. text/html
  contentTypes: string[]
  accept: string
  httpsOnly?: boolean
  // The caller's own cancellation, e.g. a chat turn the visitor stopped. An abort rejects with the signal's reason rather than
  // a SafeFetchError, as it isn't the URL's fault
  signal?: AbortSignal
}

export interface SafeFetchResult {
  url: string
  status: number
  contentType: string
  body: string
}

const blockedRanges = new net.BlockList()
for (const [network, prefix] of [
  ["0.0.0.0", 8],
  ["10.0.0.0", 8],
  ["100.64.0.0", 10],
  ["127.0.0.0", 8],
  ["169.254.0.0", 16],
  ["172.16.0.0", 12],
  ["192.0.0.0", 24],
  ["192.0.2.0", 24],
  ["192.88.99.0", 24],
  ["192.168.0.0", 16],
  ["198.18.0.0", 15],
  ["198.51.100.0", 24],
  ["203.0.113.0", 24],
  ["224.0.0.0", 4],
  ["240.0.0.0", 4],
] as const) {
  blockedRanges.addSubnet(network, prefix, "ipv4")
}
for (const [network, prefix] of [
  ["::", 128],
  ["::1", 128],
  ["64:ff9b::", 96],
  ["64:ff9b:1::", 48],
  ["100::", 64],
  ["2001::", 23],
  ["2001:db8::", 32],
  ["2002::", 16],
  ["fc00::", 7],
  ["fe80::", 10],
  ["fec0::", 10],
  ["ff00::", 8],
] as const) {
  blockedRanges.addSubnet(network, prefix, "ipv6")
}

export function isPublicAddress(address: string) {
  const family = net.isIP(address)
  if (family === 4) return !blockedRanges.check(address, "ipv4")
  if (family !== 6) return false

  // IPv4-mapped (::ffff:a.b.c.d) and IPv4-compatible addresses are checked as the IPv4 address they carry
  const mapped = address.toLowerCase().match(/^::(?:ffff:)?(\d+\.\d+\.\d+\.\d+)$/)
  if (mapped) return !blockedRanges.check(mapped[1], "ipv4")
  if (/^::ffff:/i.test(address)) return false

  return !blockedRanges.check(address, "ipv6")
}

// DNS lookup that refuses hosts resolving to any non-public address
const publicOnlyLookup: LookupFunction = (hostname, options, callback) => {
  lookup(hostname, { ...options, all: true, verbatim: true }, (error, addresses) => {
    if (error) return callback(error, "", 4)

    const list = addresses as unknown as { address: string; family: number }[]
    if (list.length === 0 || list.some(({ address }) => !isPublicAddress(address))) {
      return callback(new SafeFetchError("The URL points to a private or reserved network address.", "blocked_destination"), "", 4)
    }

    if (options.all) {
      ;(callback as unknown as (error: null, addresses: { address: string; family: number }[]) => void)(null, list)
    } else {
      callback(null, list[0].address, list[0].family)
    }
  })
}

// The destination checks every fetch and post runs before connecting, for a URL saved to be fetched later, such as a website
// to crawl: a public http(s) URL on a default port, without credentials. Throws a SafeFetchError whose message is written for
// whoever entered the URL. The addresses a host resolves to are only checked when it is fetched
export function checkPublicUrl(raw: string, { httpsOnly = false }: { httpsOnly?: boolean } = {}): URL {
  return checkUrl(raw, httpsOnly)
}

function checkUrl(raw: string, httpsOnly: boolean) {
  let url: URL
  try {
    url = new URL(raw)
  } catch {
    throw new SafeFetchError("The URL is not valid.", "invalid_url")
  }

  if (url.protocol !== "https:" && (httpsOnly || url.protocol !== "http:")) {
    throw new SafeFetchError(`Only ${httpsOnly ? "https" : "http and https"} URLs can be fetched.`, "invalid_url")
  }
  if (url.username || url.password) {
    throw new SafeFetchError("URLs with credentials are not fetched.", "invalid_url")
  }
  if (url.port && url.port !== (url.protocol === "https:" ? "443" : "80")) {
    throw new SafeFetchError("Only the default http(s) ports can be fetched.", "blocked_destination")
  }

  const host = url.hostname.replace(/^\[|\]$/g, "")
  if (net.isIP(host) ? !isPublicAddress(host) : host === "localhost" || host.endsWith(".localhost") || !host.includes(".")) {
    throw new SafeFetchError("The URL points to a private or reserved network address.", "blocked_destination")
  }

  return url
}

const USER_AGENT = "LumiBot/1.0 (+https://lumi.nieve.ai)"

function request(
  url: URL,
  signal: AbortSignal,
  { method = "GET", headers, body }: { method?: "GET" | "POST"; headers: Record<string, string>; body?: string }
) {
  const client = url.protocol === "https:" ? https : http
  return new Promise<IncomingMessage>((resolve, reject) => {
    const req = client.request(
      url,
      {
        method,
        lookup: publicOnlyLookup,
        signal,
        // A fresh connection per request: no keep-alive agent is shared with other callers
        agent: false,
        headers: { ...headers, "user-agent": USER_AGENT, ...(body !== undefined && { "content-length": String(Buffer.byteLength(body)) }) },
      },
      resolve
    )
    req.on("error", reject)
    req.end(body)
  })
}

async function readBody(response: IncomingMessage, maxBytes: number) {
  const declared = Number(response.headers["content-length"])
  if (Number.isFinite(declared) && declared > maxBytes) {
    response.destroy()
    throw new SafeFetchError("The response is too large.", "too_large")
  }

  const encoding = String(response.headers["content-encoding"] || "identity").toLowerCase()
  const decoder =
    encoding === "gzip" || encoding === "x-gzip"
      ? zlib.createGunzip()
      : encoding === "deflate"
        ? zlib.createInflate()
        : encoding === "br"
          ? zlib.createBrotliDecompress()
          : undefined
  if (!decoder && encoding !== "identity") {
    response.destroy()
    throw new SafeFetchError("The response uses an unsupported encoding.", "unsupported_content")
  }

  const stream = decoder ? response.pipe(decoder) : response
  const chunks: Buffer[] = []
  let size = 0
  try {
    for await (const chunk of stream) {
      size += (chunk as Buffer).length
      if (size > maxBytes) throw new SafeFetchError("The response is too large.", "too_large")
      chunks.push(chunk as Buffer)
    }
  } finally {
    response.destroy()
  }

  return Buffer.concat(chunks)
}

function decodeText(body: Buffer, contentType: string) {
  const charset = contentType.match(/charset="?([\w-]+)"?/i)?.[1]
  try {
    return new TextDecoder(charset || "utf-8").decode(body)
  } catch {
    return new TextDecoder("utf-8").decode(body)
  }
}

export async function safeFetch(rawUrl: string, options: SafeFetchOptions): Promise<SafeFetchResult> {
  const { timeoutMs = 8000, maxBytes = 2 * 1024 * 1024, maxRedirects = 3, contentTypes, accept, httpsOnly = false } = options
  const timeout = AbortSignal.timeout(timeoutMs)
  const signal = options.signal ? AbortSignal.any([timeout, options.signal]) : timeout
  let url = checkUrl(rawUrl, httpsOnly)

  try {
    for (let redirects = 0; ; redirects++) {
      const response = await request(url, signal, { headers: { accept, "accept-encoding": "gzip, deflate, br" } })
      const status = response.statusCode ?? 0

      if (status >= 300 && status < 400 && response.headers.location) {
        response.destroy()
        if (redirects >= maxRedirects) throw new SafeFetchError("The URL redirects too many times.", "http_error")
        url = checkUrl(new URL(response.headers.location, url).toString(), httpsOnly)
        continue
      }

      if (status < 200 || status >= 300) {
        response.destroy()
        throw new SafeFetchError(`The server answered with HTTP ${status}.`, "http_error", status)
      }

      const contentType = String(response.headers["content-type"] || "").toLowerCase()
      if (!contentTypes.some((type) => contentType.startsWith(type))) {
        response.destroy()
        throw new SafeFetchError(`The content type ${contentType || "(none)"} is not supported.`, "unsupported_content")
      }

      const body = await readBody(response, maxBytes)
      return { url: url.toString(), status, contentType, body: decodeText(body, contentType) }
    }
  } catch (error) {
    if (options.signal?.aborted) throw options.signal.reason ?? error
    asSafeFetchError(error, timeout, "The URL could not be fetched.")
  }
}

function asSafeFetchError(error: unknown, signal: AbortSignal, networkError: string): never {
  if (error instanceof SafeFetchError) throw error
  if (signal.aborted) throw new SafeFetchError("The URL took too long to answer.", "timeout")
  // Lookup failures surface as the SafeFetchError passed to the lookup callback
  if ((error as { reason?: string }).reason === "blocked_destination") throw error
  throw new SafeFetchError(networkError, "network_error")
}

export interface SafePostOptions {
  // The body's media type is the caller's, e.g. application/json. Never cookies or authorization
  headers: Record<string, string>
  body: string
  timeoutMs?: number
  httpsOnly?: boolean
}

// POSTs the body and resolves with the status of a 2xx answer, whose body is ignored. Redirects aren't followed, since
// following one would send the body to a destination nobody checked: a 3xx fails like any other non-2xx answer with an
// http_error naming the status
export async function safePost(
  rawUrl: string,
  { headers, body, timeoutMs = 10_000, httpsOnly = true }: SafePostOptions
): Promise<{ status: number }> {
  const signal = AbortSignal.timeout(timeoutMs)
  const url = checkUrl(rawUrl, httpsOnly)

  try {
    const response = await request(url, signal, { method: "POST", headers, body })
    const status = response.statusCode ?? 0
    response.destroy()

    if (status >= 300 && status < 400)
      throw new SafeFetchError(`The server answered with a redirect (HTTP ${status}), which isn't followed.`, "http_error")
    if (status < 200 || status >= 300) throw new SafeFetchError(`The server answered with HTTP ${status}.`, "http_error")
    return { status }
  } catch (error) {
    // The system error code (ECONNREFUSED, ENOTFOUND…) tells whoever set up the destination what to fix
    const code = (error as { code?: unknown }).code
    asSafeFetchError(error, signal, `The URL could not be reached${typeof code === "string" ? ` (${code})` : ""}.`)
  }
}
