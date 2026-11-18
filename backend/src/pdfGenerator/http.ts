import type { IncomingMessage, ServerResponse } from "node:http"
import { readBody, sendJson } from "@/container/server"

import { parsePdfRequest, PdfPageRangeError, renderPdf, type PdfRequest, type RenderOptions } from "./render"

// POST /pdf on a Node server, shared by the container API (src/container/api.ts) and the local tasks server
// (src/tasks/local/server.ts): { document, filename, pdfOptions? } rendered to a PDF with a Chromium on the same machine, at
// most MAX_CONCURRENT_PDFS at once. Who may call it, and whether their documents run scripts, is up to the server

// Chromium runs without its sandbox, which needs privileges Docker doesn't give by default. Each render gets a browser of its
// own. /dev/shm is small in Docker, so Chromium uses /tmp
const CHROMIUM_ARGS = ["--no-sandbox", "--disable-dev-shm-usage", "--disable-gpu", "--no-first-run", "--no-zygote"]

// Renders at most this many PDFs at once, each in its own Chromium; the rest wait their turn
const MAX_CONCURRENT_PDFS = 2

// At most this many renders wait their turn; more are refused (503) rather than queue without end and hold their requests
const MAX_WAITING_PDFS = 20

// How long a refused render is asked to wait before trying again: about one render's time
const PDF_RETRY_AFTER_SECONDS = 10

// Thrown when the wait queue is full
class PdfQueueFullError extends Error {}

// Thrown by a server's chromiumPath when it has no Chromium to render with. Its message, which says how to set one up, is the
// answer (503)
export class ChromiumUnavailableError extends Error {}

function createPdfQueue(chromiumPath: () => string) {
  let running = 0
  const waiting: (() => void)[] = []

  return async function render(request: PdfRequest, renderOptions: RenderOptions) {
    if (running >= MAX_CONCURRENT_PDFS) {
      if (waiting.length >= MAX_WAITING_PDFS) throw new PdfQueueFullError()
      // The render that ends hands its slot over, so `running` already counts this one
      await new Promise<void>((resolve) => waiting.push(resolve))
    } else {
      running++
    }
    try {
      const executablePath = chromiumPath()
      // The headless shell runs in puppeteer's "shell" mode; a full Chromium or Chrome in its new headless mode
      const headless = /headless-shell(\.exe)?$/i.test(executablePath) ? "shell" : true
      return await renderPdf(request, { executablePath, args: CHROMIUM_ARGS, headless }, renderOptions)
    } finally {
      // The slot goes straight to the next render waiting, so one arriving meanwhile can't take it as well
      const next = waiting.shift()
      if (next) next()
      else running--
    }
  }
}

// The filename as a header allows it: an ASCII fallback, and the name itself encoded (RFC 6266)
function contentDisposition(filename: string) {
  const fallback = filename.replace(/[^\x20-\x7e]/g, "_").replace(/["\\]/g, "_")
  return `attachment; filename="${fallback}"; filename*=UTF-8''${encodeURIComponent(filename)}`
}

// The /pdf handler, with a render queue of its own. chromiumPath gives the browser's executable for each render, read when the
// render starts, or throws ChromiumUnavailableError
export function createPdfHandler(chromiumPath: () => string) {
  const renderQueuedPdf = createPdfQueue(chromiumPath)

  return async function pdf(req: IncomingMessage, res: ServerResponse, renderOptions: RenderOptions) {
    const parsed = parsePdfRequest((req.method || "GET").toUpperCase(), (await readBody(req)).toString("utf8"))
    if (!parsed.ok) {
      sendJson(res, parsed.statusCode, { message: parsed.message })
      return
    }

    let document: Uint8Array
    try {
      document = await renderQueuedPdf(parsed.request, renderOptions)
    } catch (error) {
      if (error instanceof PdfQueueFullError) {
        sendJson(
          res,
          503,
          { message: "Too many PDFs are being generated. Try again in a moment." },
          { "Retry-After": String(PDF_RETRY_AFTER_SECONDS) }
        )
        return
      }
      if (error instanceof ChromiumUnavailableError) {
        sendJson(res, 503, { message: error.message })
        return
      }
      if (error instanceof PdfPageRangeError) {
        sendJson(res, 400, { message: error.message })
        return
      }
      console.error("Error generating the PDF", error)
      sendJson(res, 500, { message: "Internal Server Error" })
      return
    }

    res.writeHead(200, {
      "Content-Type": "application/pdf",
      "Content-Disposition": contentDisposition(parsed.request.filename),
      "Content-Length": String(document.byteLength),
    })
    res.end(Buffer.from(document))
  }
}
