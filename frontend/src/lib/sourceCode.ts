import "server-only"

// Where the chat pages offer Lumi's source code, as the AGPL v3 asks of an installation whose users interact with it over a
// network. Lumi's own repository by default; an installation running a modified version sets LUMI_SOURCE_URL to where its
// source is published. Read when a page renders, so it only changes once the pages are rendered again (a restart)
export const UPSTREAM_SOURCE_URL = "https://github.com/nieve-consulting/lumi"

export function sourceCodeUrl() {
  const configured = process.env.LUMI_SOURCE_URL?.trim()
  if (!configured) return UPSTREAM_SOURCE_URL
  try {
    const url = new URL(configured)
    if (url.protocol === "https:" || url.protocol === "http:") return url.toString()
  } catch {
    // Reported below
  }
  console.error(`LUMI_SOURCE_URL is "${configured}", which is not an http(s) URL: the chat links Lumi's own repository instead`)
  return UPSTREAM_SOURCE_URL
}
