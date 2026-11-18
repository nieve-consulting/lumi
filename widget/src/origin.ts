// Also imported by the webpack config to check LUMI_WIDGET_ORIGIN, so it must stay free of browser globals and imports

// Reads a Lumi installation's origin, such as https://lumi.example.com, normalized to scheme, host and port. Anything that
// isn't an absolute http(s) URL with at most a "/" path and no credentials, query or fragment gets the reason instead
export function parseOrigin(value: unknown): { origin: string } | { error: string } {
  if (typeof value !== "string" || !value.trim()) return { error: "it is empty" }

  let url: URL
  try {
    url = new URL(value.trim())
  } catch {
    return { error: "it isn't an absolute URL" }
  }

  if (url.protocol !== "https:" && url.protocol !== "http:") return { error: "it must start with https:// or http://" }
  if (url.username || url.password) return { error: "it must not contain credentials" }
  if (url.pathname !== "/") return { error: `it must not have a path (${url.pathname})` }
  if (url.search || url.hash) return { error: "it must not have a query or fragment" }

  return { origin: url.origin }
}
