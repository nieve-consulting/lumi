import { checkPublicUrl } from "@/utils/safeFetch"
import puppeteer, { type HTTPRequest, type LaunchOptions, type LowerCasePaperFormat, type PDFMargin, type PDFOptions } from "puppeteer-core"

// The PDF service's request and rendering, shared by the Lambda (lambda/entry.ts, with @sparticuz/chromium), the container
// API (src/container/api.ts, with the image's Chromium) and the local tasks server (src/tasks/local/server.ts, with a locally
// installed one), the last two through http.ts

const defaultPdfOptions: PDFOptions = {
  format: "A4",
  printBackground: true,
}

const DEFAULT_VIEWPORT = { deviceScaleFactor: 1, hasTouch: false, height: 1080, isLandscape: true, isMobile: false, width: 1920 }

export interface PdfRequest {
  document: string
  filename: string
  pdfOptions?: AllowedPdfOptions
}

// The PDF options a request may set: the page's layout only. Others, such as a path to write to, a timeout, sizes or header
// and footer templates, are dropped
export type AllowedPdfOptions = Pick<PDFOptions, "format" | "landscape" | "printBackground" | "scale" | "margin" | "pageRanges" | "preferCSSPageSize">

export type PdfRequestResult = { ok: true; request: PdfRequest } | { ok: false; statusCode: number; message: string }

const PAPER_FORMATS: readonly LowerCasePaperFormat[] = ["letter", "legal", "tabloid", "ledger", "a0", "a1", "a2", "a3", "a4", "a5", "a6"]

// A short CSS length in a unit Chromium's printing takes, e.g. 10mm or 0.5in
const CSS_LENGTH = /^(?:0|\d{1,4}(?:\.\d{1,4})?(?:px|in|cm|mm))$/

// One page or range of pages, e.g. 8 or 11-13, of the comma-separated list pageRanges takes
const PAGE_RANGE = /^(\d{1,5})(?:\s*-\s*(\d{1,5}))?$/

// Whether the value is pages and ranges such as 1-5, 8, 11-13: pages count from 1, and a range doesn't end before it starts.
// Chromium refuses anything else
function isPageRanges(value: string) {
  if (value.length > 100) return false
  return value.split(",").every((part) => {
    const match = PAGE_RANGE.exec(part.trim())
    if (!match) return false
    const start = Number(match[1])
    const end = match[2] === undefined ? start : Number(match[2])
    return start >= 1 && end >= start
  })
}

// Thrown by renderPdf when Chromium refuses the request's page ranges, e.g. ones past the document's last page, which only
// rendering finds: a problem with the request, not the server
export class PdfPageRangeError extends Error {}

const MARGIN_SIDES = ["top", "right", "bottom", "left"] as const

// The allowed options of the request's pdfOptions, or the problem with one of them
function parsePdfOptions(value: unknown): { ok: true; options?: AllowedPdfOptions } | { ok: false; message: string } {
  if (value === undefined || value === null) return { ok: true }
  if (typeof value !== "object" || Array.isArray(value)) return { ok: false, message: "'pdfOptions' must be an object" }
  const input = value as Record<string, unknown>
  const options: AllowedPdfOptions = {}

  if (input.format !== undefined) {
    const format = typeof input.format === "string" ? PAPER_FORMATS.find((known) => known === (input.format as string).toLowerCase()) : undefined
    if (!format) return { ok: false, message: `'pdfOptions.format' must be one of ${PAPER_FORMATS.join(", ")}` }
    options.format = format
  }
  for (const flag of ["landscape", "printBackground", "preferCSSPageSize"] as const) {
    if (input[flag] === undefined) continue
    if (typeof input[flag] !== "boolean") return { ok: false, message: `'pdfOptions.${flag}' must be a boolean` }
    options[flag] = input[flag]
  }
  if (input.scale !== undefined) {
    if (typeof input.scale !== "number" || !(input.scale >= 0.1 && input.scale <= 2)) {
      return { ok: false, message: "'pdfOptions.scale' must be a number from 0.1 to 2" }
    }
    options.scale = input.scale
  }
  if (input.margin !== undefined) {
    if (!input.margin || typeof input.margin !== "object" || Array.isArray(input.margin)) {
      return { ok: false, message: "'pdfOptions.margin' must be an object" }
    }
    const margin: PDFMargin = {}
    for (const side of MARGIN_SIDES) {
      const length = (input.margin as Record<string, unknown>)[side]
      if (length === undefined) continue
      if (typeof length !== "string" || !CSS_LENGTH.test(length)) {
        return { ok: false, message: `'pdfOptions.margin.${side}' must be a length such as 10mm, 0.5in or 20px` }
      }
      margin[side] = length
    }
    options.margin = margin
  }
  if (input.pageRanges !== undefined) {
    if (typeof input.pageRanges !== "string" || !isPageRanges(input.pageRanges)) {
      return { ok: false, message: "'pdfOptions.pageRanges' must be pages and ranges such as 1-5, 8" }
    }
    options.pageRanges = input.pageRanges
  }

  return { ok: true, options }
}

// Reads the POST body: { document, filename, pdfOptions? }. A failure carries the status and message to answer with
export function parsePdfRequest(method: string, body: string | undefined): PdfRequestResult {
  if (method !== "POST") {
    return { ok: false, statusCode: 405, message: `Method [${method}] Not Allowed` }
  }

  let requestBody: { document?: unknown; filename?: unknown; pdfOptions?: unknown } | null
  try {
    requestBody = JSON.parse(body || "{}")
  } catch {
    return { ok: false, statusCode: 400, message: "Invalid JSON" }
  }

  const { document, filename, pdfOptions } = requestBody ?? {}

  if (!document || typeof document !== "string") {
    return { ok: false, statusCode: 400, message: "Missing 'document' key" }
  }

  if (!filename || typeof filename !== "string") {
    return { ok: false, statusCode: 400, message: "Missing 'filename' key" }
  }

  const options = parsePdfOptions(pdfOptions)
  if (!options.ok) {
    return { ok: false, statusCode: 400, message: options.message }
  }

  return { ok: true, request: { document, filename, pdfOptions: options.options } }
}

// The browser to launch: its executable and the arguments it needs where it runs
export interface BrowserSetup {
  executablePath: string
  args: string[]
  headless?: LaunchOptions["headless"]
}

// How the document renders. Scripts only run for the installation's own key, whose document is the web app's CV template,
// which styles itself with the Tailwind script. Chromium runs without its sandbox, so a document a generated key sends
// renders with JavaScript disabled
export interface RenderOptions {
  scripts: boolean
}

// The script the CV template styles itself with (frontend/src/app/api/pdf/team-member/templates/cv.tsx)
const TAILWIND_CDN = "https://cdn.tailwindcss.com"

// The origin of the web app, whose /media route serves the records' images, when this service knows it (the container's API;
// the PDF Lambda reaches the app over public https, as any image)
function appOrigin() {
  const base = process.env.APP_BASE_URL?.trim()
  return base ? URL.parse(base)?.origin : undefined
}

// What the page may load. The document holds text the team wrote, such as a bio whose Markdown may carry raw HTML, so the
// browser only loads what the CV needs rather than any address it names, e.g. one on the internal network or the cloud's
// metadata service: inline data, the Tailwind script, the app's own resources, and images over https from a public host (a
// business logo may be anywhere). A public host name may still resolve to a private address, but an image request can only
// show an image, never return a response's text
function isAllowedRequest(request: HTTPRequest) {
  const url = URL.parse(request.url())
  if (!url) return false
  if (url.protocol === "data:" || url.href === "about:blank") return true
  if (url.href === TAILWIND_CDN || url.href.startsWith(`${TAILWIND_CDN}/`)) return true
  if (url.origin === appOrigin()) return true
  if (request.resourceType() !== "image" || url.protocol !== "https:") return false
  try {
    checkPublicUrl(url.href, { httpsOnly: true })
    return true
  } catch {
    return false
  }
}

// Renders the HTML document to a PDF in a browser of its own, closed however the rendering ends
export async function renderPdf({ document, pdfOptions }: PdfRequest, browserSetup: BrowserSetup, { scripts }: RenderOptions): Promise<Uint8Array> {
  const browser = await puppeteer.launch({
    executablePath: browserSetup.executablePath,
    headless: browserSetup.headless ?? true,
    defaultViewport: DEFAULT_VIEWPORT,
    args: [...browserSetup.args, "--hide-scrollbars"],
    // Puppeteer closes the browser on these signals by default, which would cut off a render the container server is letting
    // finish on SIGTERM (src/container/server.ts). The browser still closes when the process exits
    handleSIGINT: false,
    handleSIGTERM: false,
    handleSIGHUP: false,
  })

  try {
    const page = await browser.newPage()
    if (!scripts) await page.setJavaScriptEnabled(false)

    await page.setRequestInterception(true)
    page.on("request", (request) => {
      if (request.isInterceptResolutionHandled()) return
      // Settling a request fails once the page is closed, which only means the render ended
      if (isAllowedRequest(request)) {
        request.continue().catch(() => undefined)
      } else {
        console.warn("PDF rendering blocked a request to", URL.parse(request.url())?.origin ?? "an invalid URL")
        request.abort("blockedbyclient").catch(() => undefined)
      }
    })

    await page.setContent(document, { waitUntil: "load" })
    await page.waitForNetworkIdle()

    try {
      return await page.pdf({
        ...defaultPdfOptions,
        ...(pdfOptions || {}),
      })
    } catch (error) {
      if (pdfOptions?.pageRanges && error instanceof Error && /page range/i.test(error.message)) {
        throw new PdfPageRangeError(`'pdfOptions.pageRanges' doesn't fit the document: ${error.message}`)
      }
      throw error
    }
  } finally {
    await browser.close().catch((error) => console.warn("Error closing the PDF browser", error))
  }
}
