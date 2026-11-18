// Small helpers for the web-standard Request/Response handlers of the MCP server and its authorization server

// Set by the Lambda and local entries from the connection, never taken from the client
export { SOURCE_IP_HEADER } from "@/services/rateLimit"

const NO_STORE = { "Cache-Control": "no-store", Pragma: "no-cache" }

export function json(body: unknown, status = 200, headers: HeadersInit = {}) {
  return Response.json(body, { status, headers: { ...NO_STORE, ...headers } })
}

// OAuth error response (RFC 6749 section 5.2)
export function oauthError(error: string, description: string, status = 400, headers: HeadersInit = {}) {
  return json({ error, error_description: description }, status, headers)
}

export function redirect(location: string, cookies: string[] = []) {
  const headers = new Headers({ Location: location, ...NO_STORE })
  cookies.forEach((cookie) => headers.append("Set-Cookie", cookie))
  return new Response(null, { status: 303, headers })
}

// HTML pages cannot be framed (clickjacking) and load nothing from elsewhere. There is no form-action directive: browsers
// apply it to the redirects that follow a form submission, and the consent form's answer redirects to Google or to the client
export function html(body: string, status = 200, cookies: string[] = []) {
  const headers = new Headers({
    "Content-Type": "text/html; charset=utf-8",
    "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'; frame-ancestors 'none'; base-uri 'none'",
    "X-Frame-Options": "DENY",
    "Referrer-Policy": "no-referrer",
    ...NO_STORE,
  })
  cookies.forEach((cookie) => headers.append("Set-Cookie", cookie))
  return new Response(body, { status, headers })
}

export { escapeHtml } from "@/utils/escapeHtml"

export function readCookie(request: Request, name: string) {
  for (const part of (request.headers.get("cookie") || "").split(";")) {
    const [key, ...value] = part.trim().split("=")
    if (key === name) return decodeURIComponent(value.join("="))
  }
}

// Cookies of the sign-in flow: only sent to the /oauth paths of this origin, never readable by scripts, and not sent on
// cross-site POSTs (SameSite=Lax), which protects the consent form against cross-site submission
export function cookie(name: string, value: string, maxAgeSeconds: number, secure: boolean) {
  return `${name}=${encodeURIComponent(value)}; Path=/oauth; Max-Age=${maxAgeSeconds}; HttpOnly; SameSite=Lax${secure ? "; Secure" : ""}`
}

export class BodyTooLargeError extends Error {}

// The request body as text, read only up to maxBytes: a larger body throws BodyTooLargeError without being buffered
export async function readText(request: Request, maxBytes = 16 * 1024) {
  if (Number(request.headers.get("content-length")) > maxBytes) throw new BodyTooLargeError()
  if (!request.body) return ""

  const reader = request.body.getReader()
  const chunks: Uint8Array[] = []
  let size = 0
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    size += value.byteLength
    if (size > maxBytes) {
      await reader.cancel()
      throw new BodyTooLargeError()
    }
    chunks.push(value)
  }

  return Buffer.concat(chunks).toString("utf8")
}

export async function readForm(request: Request, maxBytes?: number) {
  return new URLSearchParams(await readText(request, maxBytes))
}
