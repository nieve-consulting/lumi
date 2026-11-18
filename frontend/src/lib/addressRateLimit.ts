// Fixed windows per client address, counted in this server process: enough for the container installation's single web app
// process, where the proxy in front (deploy/Caddyfile) sets X-Forwarded-For from the connection. Old windows are dropped as
// new ones are counted, so the map only holds the current window's addresses
export function createAddressRateLimit(limit: number, windowSeconds: number) {
  const windowMs = windowSeconds * 1000
  const windows = new Map<string, { start: number; count: number }>()

  return (address: string) => {
    const now = Date.now()
    const start = Math.floor(now / windowMs) * windowMs
    let window = windows.get(address)
    if (!window || window.start !== start) {
      if (windows.size > 10_000) {
        for (const [key, { start: windowStart }] of windows) if (windowStart < start) windows.delete(key)
      }
      window = { start, count: 0 }
      windows.set(address, window)
    }
    window.count++
    return { allowed: window.count <= limit, retryAfterSeconds: Math.max(1, Math.ceil((start + windowMs - now) / 1000)) }
  }
}

// The client's address as the proxy in front saw it: the first X-Forwarded-For entry, else X-Real-IP. Undefined when neither
// is there, e.g. in local development without the proxy
export function clientAddress(headers: Headers) {
  return headers.get("x-forwarded-for")?.split(",")[0]?.trim() || headers.get("x-real-ip")?.trim() || undefined
}
