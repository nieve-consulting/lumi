import { deleteMatchingConversations, describeDeletionCounts, MAX_STATEMENTS_PER_BATCH } from "@/services/conversationDeletion"
import { cleanUpCheckpoints } from "@/tasks/checkpointCleanup/lambda/entry"
import { createCrawlHandler } from "@/tasks/websiteCrawler/http"

import { createCommandPool, queryTimeoutMs } from "./commands"
import { CHECKPOINT_CLEANUP_TIME_BUDGET_MS, conversationRetentionDays, servicePort } from "./config"
import { createHealthCheck } from "./health"
import { handleShutdown, isAuthorized, pathOf, sendHealth, sendJson, startServer } from "./server"

// The container's background work, in place of the crawler Lambda and the checkpoint cleanup Lambda with its schedule:
// - POST /crawls: { websiteId?, crawlId?, adminEmail? }, with the API key, which the API sends when an admin updates a
//   website's pages (WEBSITE_CRAWLER_URL). Answered 202 at once, then crawled in the background, as the Lambda's asynchronous
//   invocation does (src/tasks/websiteCrawler/http.ts)
// - The weekly checkpoint cleanup, Sundays at 03:00 UTC (backend/MAINTENANCE.md), unless CHECKPOINT_CLEANUP_SCHEDULE=off
// - With CONVERSATION_RETENTION_DAYS set, the daily conversation retention at 02:30 UTC: it deletes the conversations with no
//   activity for that many days, with their enquiries, usage records and checkpoints (src/services/conversationDeletion.ts)
// - The cleanup and the retention both delete checkpoints, so they run one after the other, never side by side: a cleanup due
//   while a retention run is still going starts once it ends
// - GET /health: unauthenticated (health.ts)
//
// A crawl ended by a restart shows as interrupted, and on SIGTERM a crawl stops before its next page and is recorded as stopped
// (src/tasks/websiteCrawler/http.ts)

// Lambda's own timeouts don't apply, so a maintenance run's budget is counted from the start, and is up as soon as the worker
// shuts down. A cleanup run continues on its next one
let shuttingDown = false
const timeBudget = (ms: number) => {
  const deadline = Date.now() + ms
  return () => (shuttingDown ? 0 : deadline - Date.now())
}

// The time a conversation retention run gets. Statements are bounded, and no batch starts with less of the budget left than its
// statements could take, so a batch cut off by them still ends within it; a run that stops for its budget continues the next day
const RETENTION_TIME_BUDGET_MS = 60 * 60 * 1000
const RETENTION_STATEMENT_TIMEOUT_MS = 60 * 1000
const RETENTION_TIME_RESERVE_MS = MAX_STATEMENTS_PER_BATCH * queryTimeoutMs(RETENTION_STATEMENT_TIMEOUT_MS)
const DAY_MS = 24 * 60 * 60 * 1000

// Daily at 02:30 UTC, the next one after `now`
export function nextRetentionRun(now: Date) {
  const next = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 2, 30, 0, 0))
  if (next <= now) next.setUTCDate(next.getUTCDate() + 1)
  return next
}

// Deletes the conversations whose last activity is more than `days` days old. Logs only counts: no thread ids, contact details
// or content
async function applyConversationRetention(days: number, remainingTimeMs: () => number) {
  const pool = createCommandPool("lumi-conversation-retention", {
    statementTimeoutMs: RETENTION_STATEMENT_TIMEOUT_MS,
    label: "Conversation retention",
  })

  try {
    const selection = { lastActivityBefore: new Date(Date.now() - days * DAY_MS) }
    console.log(`Conversation retention: deleting the conversations with no activity since ${selection.lastActivityBefore.toISOString()}`)
    const run = await deleteMatchingConversations(pool, selection, { remainingTimeMs, reserveMs: RETENTION_TIME_RESERVE_MS })
    for (const line of describeDeletionCounts(run.counts)) console.log(`Conversation retention: ${line}`)
    if (!run.complete) console.warn("Conversation retention: stopped for its time budget or a shutdown; the next run deletes the rest")
  } finally {
    await pool.end().catch(() => undefined)
  }
}

// Sundays at 03:00 UTC, the next one after `now`
export function nextCleanupRun(now: Date) {
  const next = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 3, 0, 0, 0))
  next.setUTCDate(next.getUTCDate() + ((7 - next.getUTCDay()) % 7))
  if (next <= now) next.setUTCDate(next.getUTCDate() + 7)
  return next
}

export async function startWorker() {
  // Each crawl and cleanup run opens a pool of its own and closes it at the end, as in Lambda
  const checkHealth = createHealthCheck("lumi-worker")
  const crawls = createCrawlHandler({ name: "worker", authorize: isAuthorized })
  const running = new Set<Promise<unknown>>()

  function runInBackground(name: string, work: () => Promise<unknown>) {
    const task = work()
      .catch((error) => console.error(`Error running ${name}`, error))
      .finally(() => running.delete(task))
    running.add(task)
  }

  // The checkpoint cleanup and the conversation retention, queued one after the other. Each one's time budget starts when it
  // does, and one still queued at shutdown doesn't start
  let maintenance: Promise<unknown> = Promise.resolve()
  function runMaintenance(name: string, work: () => Promise<unknown>) {
    const queued = maintenance.then(() => (shuttingDown ? undefined : work()))
    maintenance = queued.catch(() => undefined)
    runInBackground(name, () => queued)
  }

  const server = startServer("worker", servicePort("worker"), async (req, res) => {
    const path = pathOf(req)

    if (path === "/health" && req.method === "GET") {
      await sendHealth(res, checkHealth)
      return
    }
    if (path !== "/crawls") {
      sendJson(res, 404, { error: "Not found" })
      return
    }
    await crawls.handle(req, res)
  })

  let cleanupTimer: NodeJS.Timeout | undefined
  if (process.env.CHECKPOINT_CLEANUP_SCHEDULE?.trim() !== "off") {
    const schedule = () => {
      const next = nextCleanupRun(new Date())
      console.log(`Next checkpoint cleanup: ${next.toISOString()}`)
      cleanupTimer = setTimeout(() => {
        runMaintenance("the checkpoint cleanup", () => cleanUpCheckpoints({ dryRun: false }, timeBudget(CHECKPOINT_CLEANUP_TIME_BUDGET_MS)))
        schedule()
      }, next.getTime() - Date.now())
    }
    schedule()
  }

  let retentionTimer: NodeJS.Timeout | undefined
  const retentionDays = conversationRetentionDays()
  if (retentionDays !== undefined) {
    const schedule = () => {
      const next = nextRetentionRun(new Date())
      console.log(`Next conversation retention run: ${next.toISOString()} (conversations inactive for ${retentionDays} days)`)
      retentionTimer = setTimeout(() => {
        runMaintenance("the conversation retention", () => applyConversationRetention(retentionDays, timeBudget(RETENTION_TIME_BUDGET_MS)))
        schedule()
      }, next.getTime() - Date.now())
    }
    schedule()
  }

  handleShutdown(
    "worker",
    server,
    async () => {
      const tasks = [...crawls.running(), ...running]
      if (tasks.length > 0) console.log(`Waiting for ${tasks.length} background task(s) to stop`)
      await Promise.all(tasks)
    },
    // At once: no new crawl is accepted, and running ones stop before their next page
    () => {
      shuttingDown = true
      crawls.stop()
      clearTimeout(cleanupTimer)
      clearTimeout(retentionTimer)
    }
  )
}
