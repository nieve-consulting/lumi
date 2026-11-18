import type { IncomingMessage, ServerResponse } from "node:http"
import { readBody, sendJson } from "@/container/server"
import { z } from "zod"

import { crawlWebsites, type CrawlEvent } from "./lambda/entry"

// POST /crawls on a Node server, shared by the container worker (src/container/worker.ts) and the local tasks server
// (src/tasks/local/server.ts): { websiteId?, crawlId?, adminEmail? }, as startWebsiteCrawler sends it (dispatch.ts). Answered
// 202 at once, then crawled in the background, as the Lambda's asynchronous invocation does. Crawls of different websites run
// side by side; the website's advisory lock keeps one per website
//
// A crawl ended by a restart is recorded as it is when Lambda kills one: its connection closing releases the website's lock, so
// the websites page shows it interrupted rather than running, and a crawl accepted but not yet started shows as not started
// once it is overdue (src/services/websiteCrawls.ts). After stop(), as on SIGTERM, a crawl stops before its next page and is
// recorded as stopped

// The time a crawl gets. It stops before a page with less than 2 minutes of it left, and is continued by updating the website's
// pages again
const CRAWL_TIME_BUDGET_MS = 60 * 60 * 1000

const crawlEventSchema = z.object({
  websiteId: z.uuid().optional(),
  crawlId: z.uuid().optional(),
  adminEmail: z.string().max(320).optional(),
})

export interface CrawlHandlerOptions {
  // The server's name, for the answer while it shuts down, e.g. "worker"
  name: string
  // Checked after the method, before anything else: a request it refuses is answered 401
  authorize?: (req: IncomingMessage) => Promise<boolean>
}

// The /crawls handler, with the crawls it started. stop() is for the start of a shutdown: no new crawl is accepted, and running
// ones stop before their next page. running() gives the crawls still going, for the shutdown to wait for
export function createCrawlHandler({ name, authorize }: CrawlHandlerOptions) {
  const running = new Set<Promise<unknown>>()
  let stopped = false

  // Lambda's own timeouts don't apply, so the budget is counted from the start, and is up as soon as the server shuts down
  const timeBudget = (ms: number) => {
    const deadline = Date.now() + ms
    return () => (stopped ? 0 : deadline - Date.now())
  }

  async function handle(req: IncomingMessage, res: ServerResponse) {
    if (req.method !== "POST") {
      sendJson(res, 405, { error: "Method not allowed" }, { Allow: "POST" })
      return
    }
    if (authorize && !(await authorize(req))) {
      sendJson(res, 401, { error: "Unauthorized" })
      return
    }
    if (stopped) {
      sendJson(res, 503, { error: `The ${name} is shutting down` })
      return
    }

    let body: unknown
    try {
      const raw = (await readBody(req, 64 * 1024)).toString("utf8")
      body = raw ? JSON.parse(raw) : {}
    } catch {
      sendJson(res, 400, { error: "Invalid request: the body is not valid JSON" })
      return
    }
    const event = crawlEventSchema.safeParse(body)
    if (!event.success) {
      sendJson(res, 400, { error: `Invalid request: ${z.prettifyError(event.error)}` })
      return
    }

    const crawlEvent: CrawlEvent = event.data
    console.log(`Crawl accepted: ${crawlEvent.websiteId ? `website ${crawlEvent.websiteId}` : "every website"}`)
    const task = crawlWebsites(crawlEvent, timeBudget(CRAWL_TIME_BUDGET_MS))
      .catch((error) => console.error("Error running the website crawler", error))
      .finally(() => running.delete(task))
    running.add(task)
    sendJson(res, 202, { accepted: true })
  }

  return {
    handle,
    stop: () => {
      stopped = true
    },
    running: () => [...running],
  }
}
