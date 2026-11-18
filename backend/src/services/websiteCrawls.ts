import { websiteCrawls } from "@db/schema"
import { and, desc, eq, sql, type AnyColumn, type SQL } from "drizzle-orm"
import type { Pool } from "pg"

import type { Queryable, Tx } from "./db"
import { conflict } from "./errors"

// A crawl of a website holds this advisory lock (with the hash of the website's id) until it ends, so a website is crawled
// once at a time, and its pages are not cleared while a crawl still adds some: the website would be left with only part of them
const WEBSITE_CRAWL_LOCK = 2_160_001

// A requested crawl is starting for this long after it was queued, while the Lambda starts and takes the lock. It covers
// Lambda's two retries of an event whose run failed before taking it, about one and two minutes apart. Another request, or a
// clear, is refused meanwhile, so a double click starts one crawl; after it, a crawl still queued never started
export const crawlStartOverdue = (createdAt: SQL | AnyColumn) => sql<boolean>`${createdAt} < now() - interval '5 minutes'`

export const websiteBeingCrawled = () => conflict("The website is being crawled. Try again once the crawl has finished.")

// Runs the crawl of a website holding its lock, or returns false without running it when another crawl or a clear holds it. The
// lock lives in a connection held for the crawl and closed after it, which releases it however the crawl ended
export async function withWebsiteCrawlLock(pool: Pool, websiteId: string, crawl: () => Promise<void>) {
  const lockClient = await pool.connect()

  try {
    const { rows } = await lockClient.query<{ locked: boolean }>("select pg_try_advisory_lock($1, hashtext($2)) as locked", [
      WEBSITE_CRAWL_LOCK,
      websiteId,
    ])
    if (!rows[0]?.locked) return false

    await crawl()
    return true
  } finally {
    lockClient.release(true)
  }
}

// Keeps crawls of the website from starting until the transaction ends. False when one is running
export async function lockOutWebsiteCrawls(trx: Tx, websiteId: string) {
  const { rows } = await trx.execute<{ locked: boolean }>(
    sql`select pg_try_advisory_xact_lock(${WEBSITE_CRAWL_LOCK}, hashtext(${websiteId})) as locked`
  )
  return rows[0]?.locked === true
}

// Whether a crawl (or for an instant a clear) holds the website's lock, read from pg_locks without taking it: taking it, even
// for an instant, would make a crawl starting then skip the website. An advisory lock on two integers shows the first as
// classid and the second as objid, both oids, so a negative hash reads as its unsigned value, as the int4 to oid cast gives.
// Pass the website's id as stored, lowercase, which the crawl hashes
export const websiteCrawlLockHeld = (websiteId: AnyColumn | string) => sql<boolean>`exists (
  select 1 from pg_locks
  where locktype = 'advisory'
    and granted
    and database = (select oid from pg_database where datname = current_database())
    and classid = ${WEBSITE_CRAWL_LOCK}::oid
    and objid = hashtext(${websiteId}::text)::oid
    and objsubid = 2
)`

// Whether a crawl of the website is running. Unlike lockOutWebsiteCrawls, it never keeps one from starting
export async function isWebsiteBeingCrawled(db: Queryable, websiteId: string) {
  const { rows } = await db.execute<{ held: boolean }>(sql`select ${websiteCrawlLockHeld(websiteId)} as held`)
  return rows[0]?.held === true
}

// Whether the website's latest crawl, the newest requested, was requested and the crawler should still pick it up
export async function isWebsiteCrawlStarting(db: Queryable, websiteId: string) {
  const [latest] = await db
    .select({ status: websiteCrawls.status, start_overdue: crawlStartOverdue(websiteCrawls.created_at) })
    .from(websiteCrawls)
    .where(eq(websiteCrawls.website_id, websiteId))
    .orderBy(desc(websiteCrawls.created_at))
    .limit(1)
  return latest?.status === "queued" && !latest.start_overdue
}

// Fails a crawl the crawler never picked up, so it doesn't show as starting. One already running is left as it is: an event
// Lambda delivers twice finds the website locked by its own crawl
export async function failQueuedWebsiteCrawl(db: Queryable, crawlId: string, error: string) {
  await db
    .update(websiteCrawls)
    .set({ status: "failed", error, finished_at: new Date() })
    .where(and(eq(websiteCrawls.id, crawlId), eq(websiteCrawls.status, "queued")))
}
