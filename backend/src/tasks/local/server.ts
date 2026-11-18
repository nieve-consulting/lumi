import "dotenv/config"

import { accessSync, constants, statSync } from "node:fs"

// Local stand-in for the PDF Lambda and the crawler Lambda, or the container api's /pdf and the worker's /crawls, with the same
// handlers as the container (src/pdfGenerator/http.ts, src/tasks/websiteCrawler/http.ts) on http://localhost:<TASKS_PORT>:
// - POST /pdf: { document, filename, pdfOptions? } rendered with the Chromium PUPPETEER_EXECUTABLE_PATH names
// - POST /crawls: { websiteId?, crawlId?, adminEmail? }, which the backend sends with WEBSITE_CRAWLER_URL=http://localhost:4500
// - GET /health: whether PDFs can be rendered
// /pdf and /crawls need the installation's own API key (API_KEY), which the web app and the backend send, as the worker's
// /crawls does: the proxy and this port are reachable from any page a browser opens, and PDF documents run their scripts in a
// Chromium without its sandbox. It listens on 127.0.0.1 only, unless TASKS_HOST names another address: on Linux the local proxy
// reaches the host on the Docker bridge (e.g. TASKS_HOST=172.17.0.1), and the backend then sends crawls to that address too
// (WEBSITE_CRAWLER_URL=http://172.17.0.1:4500).
//
// tsx watch restarts it with SIGTERM, as Docker stops the worker: no new crawl is accepted and running ones stop before their
// next page. A crawl still on its page when tsx kills the process 5 s later shows as interrupted, as after a worker restart

process.env.NODE_ENV ||= "development"
const port = parseInt(process.env.TASKS_PORT || "4500")
const host = process.env.TASKS_HOST?.trim() || "127.0.0.1"

const CHROMIUM_SETUP =
  "Set PUPPETEER_EXECUTABLE_PATH to a Chromium or Chrome headless shell, e.g. one installed with " +
  "`npx @puppeteer/browsers install chrome-headless-shell@stable --path ~/.cache/puppeteer`, and restart the tasks server"

// Whether the path names an executable file, rather than a folder such as the one the browser was installed in
function isExecutableFile(path: string) {
  try {
    if (!statSync(path).isFile()) return false
    accessSync(path, constants.X_OK)
    return true
  } catch {
    return false
  }
}

// Why PDFs can't be rendered, or undefined when PUPPETEER_EXECUTABLE_PATH names an executable file. No default: unlike the
// container image, a developer's machine has no Chromium at a known path
function chromiumProblem() {
  const path = process.env.PUPPETEER_EXECUTABLE_PATH?.trim()
  if (!path) return `PDFs can't be generated: PUPPETEER_EXECUTABLE_PATH is not set. ${CHROMIUM_SETUP}`
  if (!isExecutableFile(path)) {
    return `PDFs can't be generated: ${path} is not an executable file, e.g. the path the install command prints. ${CHROMIUM_SETUP}`
  }
  return undefined
}

;(async () => {
  // Imported after the environment defaults are set: the configuration is read when the modules load
  const [
    { createHttpServer, handleShutdown, isAuthorized, pathOf, sendJson },
    { ChromiumUnavailableError, createPdfHandler },
    { createCrawlHandler },
  ] = await Promise.all([import("@/container/server"), import("@/pdfGenerator/http"), import("@/tasks/websiteCrawler/http")])

  const pdf = createPdfHandler(() => {
    const problem = chromiumProblem()
    if (problem) throw new ChromiumUnavailableError(problem)
    return process.env.PUPPETEER_EXECUTABLE_PATH!.trim()
  })
  const crawls = createCrawlHandler({ name: "tasks server", authorize: isAuthorized })

  const server = createHttpServer(async (req, res) => {
    const path = pathOf(req)

    if (path === "/health" && req.method === "GET") {
      const problem = chromiumProblem()
      sendJson(res, 200, { status: "ok", pdf: problem ? "unavailable" : "ok" })
      return
    }
    if (path === "/pdf") {
      if (!(await isAuthorized(req))) {
        sendJson(res, 401, { message: "Unauthorized" })
        return
      }
      // Only the installation's own key gets here, whose documents run scripts (RenderOptions in src/pdfGenerator/render.ts)
      await pdf(req, res, { scripts: true })
      return
    }
    if (path === "/crawls") {
      await crawls.handle(req, res)
      return
    }
    sendJson(res, 404, { error: "Not found" })
  })

  server.listen(port, host, () => {
    console.log(`🚀  Tasks server ready at: http://${host}:${port} (/pdf and /crawls)`)
    const problem = chromiumProblem()
    if (problem) console.warn(`Warning: ${problem}`)
  })

  handleShutdown(
    "tasks server",
    server,
    async () => {
      const running = crawls.running()
      if (running.length > 0) console.log(`Waiting for ${running.length} crawl(s) to stop`)
      await Promise.all(running)
    },
    // At once: no new crawl is accepted, and running ones stop before their next page
    () => crawls.stop()
  )
})()
