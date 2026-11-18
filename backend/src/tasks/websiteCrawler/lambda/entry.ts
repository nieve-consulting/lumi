import { createHash } from "node:crypto"
import type { EmbeddingUsage } from "@/ai/usage"
import { addAdminEmbeddingUsage } from "@/apollo/sources/adminUsage"
import { WebpageDocumentLoader } from "@/langchain/document-loaders/WebpageDocumentLoader"
import { UsageReportingEmbeddings } from "@/langchain/embeddings/UsageReportingEmbeddings"
import { SemanticChunker } from "@/langchain/text-splitters/SemanticChunker"
import { LumiVectorStore, VECTOR_EMBEDDINGS } from "@/langchain/vector-stores/LumiVectorStore"
import { failQueuedWebsiteCrawl, withWebsiteCrawlLock } from "@/services/websiteCrawls"
import { isExcludedPath, normalizeWebsiteUrl, sameSite, sitemapUrlOf } from "@/services/websiteUrls"
import { createDb } from "@/utils/db-setup"
import { safeFetch, SafeFetchError } from "@/utils/safeFetch"
import type { DbType } from "@db/db"
import { websiteCrawls, websitePages, websitePageVectors, websites as websitesTable } from "@db/schema"
import { WEBSITE_CRAWL_LIMITS } from "@lumi/shared-contracts/knowledge"
import { WEBSITE_CRAWL_PURPOSE } from "@lumi/shared-contracts/usage"
import { Handler } from "aws-lambda"
import { and, desc, eq, inArray, notInArray } from "drizzle-orm"
import { v4 as uuidv4 } from "uuid"
import { parseStringPromise } from "xml2js"

// The website and the admin who asked to update it from the websites page, with the crawl queued for it, which the crawler
// records its progress and outcome on. Invoked without a website, it crawls them all, adding a crawl for each as it starts
export interface CrawlEvent {
  websiteId?: string
  crawlId?: string
  adminEmail?: string
}

type CrawlValues = Partial<typeof websiteCrawls.$inferInsert>

// No page is started this close to the Lambda's timeout, which would end the crawl without releasing its database connections
// and have Lambda retry it. Pages already crawled are skipped by the next run
const TIMEOUT_MARGIN_MS = 2 * 60 * 1000

// The crawl's progress is written after each page crawled, and for pages left unmodified, which take an instant, at most this often
const PROGRESS_INTERVAL_MS = 2_000

// Ends the website's crawl with the reason the websites page shows, written for the admin. The logs keep the error behind it
class CrawlFailure extends Error {}

// Reason shown for an error that ends the crawl without saying why
const UNEXPECTED_FAILURE = "The crawl failed unexpectedly"

// Reason shown on a requested crawl whose run went to a newer request, or was skipped as one had already run
const SUPERSEDED = "Superseded by a newer request"

// Every sitemap and page is fetched with safeFetch: public http(s) addresses only, each redirect checked again, and bounded in
// time and size (WEBSITE_CRAWL_LIMITS). Sitemaps must be plain XML: compressed (.gz) sitemaps aren't supported
const FETCH_LIMITS = { timeoutMs: WEBSITE_CRAWL_LIMITS.timeoutMs, maxBytes: WEBSITE_CRAWL_LIMITS.maxBytes }
const SITEMAP_CONTENT_TYPES = ["application/xml", "text/xml"]
const SITEMAP_ACCEPT = "application/xml, text/xml;q=0.9"
const PAGE_CONTENT_TYPES = ["text/html", "application/xhtml+xml"]
const PAGE_ACCEPT = "text/html, application/xhtml+xml;q=0.9"

// A page the sitemap lists on the website's host, stored by its path with any query string, as pages that differ only by
// query are different pages. Exclusions match the pathname alone
type SitemapPage = { loc: string; lastmod?: string; path: string; pathname: string }

// HTTP statuses that mean the page is no longer public: removed with its search content like a page that is gone
const GONE_STATUSES = [401, 403, 404, 410]

// What a page's fetch failing means for its search content: "remove" when the page is gone or can't be indexed (not HTML,
// too large, refused destination), "keep" when the failure may be temporary (timeout, network error, server error), so its
// content stays until a later crawl reads it. Any other error fails the crawl
function pageFetchOutcome(error: unknown): "remove" | "keep" | undefined {
  if (!(error instanceof SafeFetchError)) return undefined
  switch (error.reason) {
    case "http_error":
      return error.status !== undefined && GONE_STATUSES.includes(error.status) ? "remove" : "keep"
    case "unsupported_content":
    case "too_large":
    case "blocked_destination":
    case "invalid_url":
      return "remove"
    case "timeout":
    case "network_error":
      return "keep"
  }
}

type SitemapEntry = { loc: string; lastmod?: string }

// The reason a fetch failed, for the admin: safeFetch's own messages say what happened without internals
function reasonOf(error: unknown) {
  return error instanceof SafeFetchError ? error.message : "The request failed unexpectedly."
}

async function fetchSitemap(url: string) {
  if (/\.gz$/i.test(URL.parse(url)?.pathname ?? "")) {
    throw new CrawlFailure(`Sitemap ${url} is compressed (.gz), which isn't supported: use a plain XML sitemap`)
  }
  try {
    return (await safeFetch(url, { ...FETCH_LIMITS, contentTypes: SITEMAP_CONTENT_TYPES, accept: SITEMAP_ACCEPT })).body
  } catch (error) {
    throw new CrawlFailure(`Sitemap ${url} couldn't be fetched: ${reasonOf(error)}`, { cause: error })
  }
}

const textOf = (value: unknown) => (typeof value === "string" ? value.trim() : undefined)

// A sitemap's pages (urlset), or the sitemaps a sitemap index lists (sitemapindex)
async function parseSitemap(url: string, xml: string): Promise<{ index: false; pages: SitemapEntry[] } | { index: true; sitemaps: string[] }> {
  let parsed
  try {
    parsed = await parseStringPromise(xml)
  } catch (error) {
    throw new CrawlFailure(`Sitemap ${url} couldn't be read: it isn't valid XML`, { cause: error })
  }

  if (parsed?.sitemapindex) {
    const sitemaps = (parsed.sitemapindex.sitemap ?? []).map((sitemap: { loc?: unknown[] }) => textOf(sitemap.loc?.[0]))
    return { index: true, sitemaps: sitemaps.filter(Boolean) }
  }
  if (parsed?.urlset) {
    const pages = (parsed.urlset.url ?? []).map((page: { loc?: unknown[]; lastmod?: unknown[] }) => ({
      loc: textOf(page.loc?.[0]),
      lastmod: textOf(page.lastmod?.[0]) || undefined,
    }))
    return { index: false, pages: pages.filter(({ loc }: { loc?: string }) => loc) }
  }
  throw new CrawlFailure(`Sitemap ${url} couldn't be read: it is neither a sitemap (urlset) nor a sitemap index (sitemapindex)`)
}

// The pages the website's sitemap lists. A sitemap index's sitemaps are read one level deep, up to
// WEBSITE_CRAWL_LIMITS.maxSitemaps, and only on the website's or the index's host. Any of them failing fails the crawl, which
// would otherwise remove the pages it lists
async function readSitemap(url: string, websiteHost: string): Promise<SitemapEntry[]> {
  const root = await parseSitemap(url, await fetchSitemap(url))
  if (!root.index) return root.pages

  const indexHost = URL.parse(url)?.hostname ?? websiteHost
  const sitemaps = root.sitemaps.filter((loc) => {
    const host = URL.parse(loc)?.hostname
    const allowed = host !== undefined && (sameSite(host, websiteHost) || sameSite(host, indexHost))
    if (!allowed) console.warn(`Skipping sitemap on another host: ${loc}`)
    return allowed
  })
  if (sitemaps.length > WEBSITE_CRAWL_LIMITS.maxSitemaps) {
    console.warn(`Sitemap index lists ${sitemaps.length} sitemaps: only the first ${WEBSITE_CRAWL_LIMITS.maxSitemaps} are read`)
  }

  const pages: SitemapEntry[] = []
  for (const loc of sitemaps.slice(0, WEBSITE_CRAWL_LIMITS.maxSitemaps)) {
    const sitemap = await parseSitemap(loc, await fetchSitemap(loc))
    if (sitemap.index) {
      console.warn(`Skipping nested sitemap index, only one level is read: ${loc}`)
      continue
    }
    pages.push(...sitemap.pages)
  }
  return pages
}

// Deleting a page deletes its vectors (website_page_vectors.webpage_id)
async function removePage(db: DbType, crawl: CrawlRecord, pageId: string) {
  await db.delete(websitePages).where(eq(websitePages.id, pageId))
  crawl.pagesRemoved(1)
}

// Run by the Lambda's asynchronous invocation, with the Lambda's time left, and in the container installation by the worker
// (src/container/worker.ts), with a time budget of its own
export const handler: Handler<CrawlEvent | undefined> = (event, context) => crawlWebsites(event, () => context.getRemainingTimeInMillis())

// Crawls the event's website, or every website. No page starts with less than TIMEOUT_MARGIN_MS of remainingTimeMs left
export async function crawlWebsites(event: CrawlEvent | undefined, remainingTimeMs: () => number) {
  // Runs are rare, so each opens its own pool and closes it at the end rather than keep connections that go stale in between
  const dbSession = await createDb("lumi-web-crawler")

  // The embedding requests not recorded yet. They are recorded after each page, so a crawl that fails or stops part way keeps
  // the usage of the pages it crawled
  const pendingUsage: EmbeddingUsage[] = []
  const reportUsage = (usage: EmbeddingUsage) => {
    pendingUsage.push(usage)
  }
  const recordPendingUsage = () => addAdminEmbeddingUsage(dbSession, event?.adminEmail, WEBSITE_CRAWL_PURPOSE, pendingUsage.splice(0))

  const chunkingEmbeddings = new UsageReportingEmbeddings({ model: "text-embedding-3-large", dimensions: 3000 }, reportUsage)
  const vectorEmbeddings = new UsageReportingEmbeddings(VECTOR_EMBEDDINGS, reportUsage)
  let outOfTime = false

  try {
    console.log("Start website crawler task")

    const websites = await dbSession.query.websites.findMany({
      where: event?.websiteId ? eq(websitesTable.id, event.websiteId) : undefined,
      columns: {
        id: true,
        url: true,
        sitemap: true,
        exclude_paths: true,
        last_processed: true,
      },
    })

    const vectorStore = new LumiVectorStore(dbSession.$client, vectorEmbeddings)

    const splitter = new SemanticChunker(chunkingEmbeddings)

    for (const website of websites) {
      if (outOfTime) break

      // The event's crawl is of its website only; any other website crawled gets its own
      const queuedCrawlId = website.id === event?.websiteId ? event?.crawlId : undefined

      try {
        const crawled = await withWebsiteCrawlLock(dbSession.$client, website.id, async () => {
          // Recorded while the crawl holds the lock: once it is released, a crawl still running reads as interrupted
          const crawl = await CrawlRecord.start(dbSession, website.id, queuedCrawlId, event?.adminEmail)
          if (!crawl) {
            console.warn(`Website skipped: a newer crawl request already ran: ${website.url}`)
            return
          }
          console.log(`Crawling website: ${website.url}`)

          try {
            const websiteUrl = URL.parse(normalizeWebsiteUrl(website.url))
            if (!websiteUrl) throw new CrawlFailure("The website's URL isn't valid")
            const websiteHost = websiteUrl.hostname

            // The pages the sitemap lists on the website's own host, once each by path and query. A page listed on another host,
            // or with an invalid URL, is left out
            const entries = await readSitemap(sitemapUrlOf(website.url, website.sitemap), websiteHost)
            if (entries.length === 0) throw new CrawlFailure("Sitemap lists no pages")

            const listed = new Map<string, SitemapPage>()
            for (const { loc, lastmod } of entries) {
              const url = URL.parse(loc)
              if (!url || (url.protocol !== "https:" && url.protocol !== "http:")) {
                console.warn(`Skipping invalid page URL: ${loc}`)
                continue
              }
              if (!sameSite(url.hostname, websiteHost)) {
                console.warn(`Skipping page on another host: ${loc}`)
                continue
              }
              url.hash = ""
              const path = url.pathname + url.search
              if (!listed.has(path)) listed.set(path, { loc: url.toString(), lastmod, path, pathname: url.pathname })
            }
            if (listed.size === 0) throw new CrawlFailure(`Sitemap lists no pages on ${websiteHost}`)

            // Without those excluded, up to the page limit, so the crawl knows how many it has to check
            const included = [...listed.values()].filter(({ path, pathname }) => {
              const exclude = isExcludedPath(pathname, website.exclude_paths)
              if (exclude) console.log(`Excluding path: ${path}`)
              return !exclude
            })
            const pages = included.slice(0, WEBSITE_CRAWL_LIMITS.maxPages)
            if (included.length > pages.length) {
              console.warn(`Sitemap lists ${included.length} pages: only the first ${pages.length} are crawled: ${website.url}`)
            }
            const crawledPaths = new Set(pages.map(({ path }) => path))
            await crawl.setTotal(pages.length, included.length - pages.length)

            for (const { loc, lastmod, path } of pages) {
              if (remainingTimeMs() < TIMEOUT_MARGIN_MS) {
                outOfTime = true
                console.warn(`Stopped crawling website before the run's time limit: ${website.url}. Update its pages again to continue`)
                // A stopped crawl removes no page it didn't reach: the next one does once it completes
                await crawl.stopped()
                return
              }

              const page = await dbSession.query.websitePages.findFirst({
                where: (websitePages, { eq, and }) => and(eq(websitePages.website_id, website.id), eq(websitePages.path, path)),
                columns: { id: true, last_processed: true, content_hash: true },
              })

              // A page the sitemap dates is only fetched when modified since it was last processed. One it doesn't date is
              // fetched once per completed crawl and only embedded again when its text changed: one already checked since the
              // last completed crawl was reached by a crawl that stopped before the Lambda timeout, so this one carries on
              // from where it stopped rather than fetching the same pages again
              const lastMod = lastmod ? new Date(lastmod) : undefined
              const dated = lastMod !== undefined && !Number.isNaN(lastMod.getTime())
              if (page?.last_processed && dated && lastMod <= page.last_processed) {
                console.log(`Not modified path: ${path}`)
                await crawl.pageChecked(false)
                continue
              }
              if (page?.last_processed && !dated && (!website.last_processed || page.last_processed > website.last_processed)) {
                console.log(`Already checked since the last completed crawl: ${path}`)
                await crawl.pageChecked(false)
                continue
              }

              let html: string
              try {
                const fetched = await safeFetch(loc, { ...FETCH_LIMITS, contentTypes: PAGE_CONTENT_TYPES, accept: PAGE_ACCEPT })
                const finalUrl = URL.parse(fetched.url)
                if (!finalUrl || !sameSite(finalUrl.hostname, websiteHost)) {
                  // Not the website's content any more: removed like a page that is gone
                  console.warn(`Page redirects to another host, so it isn't indexed: ${path} → ${fetched.url}`)
                  if (page) await removePage(dbSession, crawl, page.id)
                  await crawl.pageChecked(false)
                  continue
                }
                const finalPath = finalUrl.pathname + finalUrl.search
                if (finalPath !== path && crawledPaths.has(finalPath)) {
                  // The page it redirects to is crawled under its own path, so this one would only index the same text twice
                  console.log(`Page redirects to another crawled page, so it isn't indexed twice: ${path} → ${finalPath}`)
                  if (page) await removePage(dbSession, crawl, page.id)
                  await crawl.pageChecked(false)
                  continue
                }
                html = fetched.body
              } catch (error) {
                const outcome = pageFetchOutcome(error)
                if (!outcome) throw new CrawlFailure(`Page ${path} couldn't be loaded: ${reasonOf(error)}`, { cause: error })
                if (outcome === "remove") {
                  console.warn(`Page not indexed: ${path}: ${reasonOf(error)}`)
                  if (page) await removePage(dbSession, crawl, page.id)
                } else {
                  // Left as it is, so the next crawl tries it again
                  console.warn(`Page skipped, its search content is kept: ${path}: ${reasonOf(error)}`)
                }
                await crawl.pageChecked(false)
                continue
              }

              const pageId =
                page?.id ?? (await dbSession.insert(websitePages).values({ website_id: website.id, path }).returning({ id: websitePages.id }))[0].id

              const loader = new WebpageDocumentLoader(html, pageId)
              let documents
              try {
                documents = await loader.load()
              } catch (error) {
                throw new CrawlFailure(`Page ${path} couldn't be read`, { cause: error })
              }
              const text = documents
                .map(({ pageContent }) => pageContent)
                .join("\n")
                .trim()
              const contentHash = createHash("sha256").update(text).digest("hex")

              if (page?.last_processed && page.content_hash === contentHash) {
                // Its search content is still current: only when it was checked and its title are kept
                await dbSession.update(websitePages).set({ last_processed: new Date(), title: loader.getTitle() }).where(eq(websitePages.id, pageId))
                console.log(`Unchanged path: ${path}`)
                await crawl.pageChecked(false)
                continue
              }

              try {
                // A page without text gets no search content
                const splits = text ? (await splitter.splitDocuments(documents)).filter(({ pageContent }) => pageContent.trim()) : []
                if (!text) console.log(`Page has no text to search: ${path}`)

                // Delete old vectors and add new ones
                await dbSession.delete(websitePageVectors).where(eq(websitePageVectors.webpage_id, pageId))
                if (splits.length) await vectorStore.addDocuments(splits, { ids: Array.from({ length: splits.length }, () => uuidv4()) })

                await dbSession
                  .update(websitePages)
                  .set({ last_processed: new Date(), title: loader.getTitle(), content_hash: contentHash })
                  .where(eq(websitePages.id, pageId))
              } catch (error) {
                throw new CrawlFailure(`Page ${path} couldn't be indexed`, { cause: error })
              }
              await recordPendingUsage()
              await crawl.pageChecked(true)

              console.log(`Website page crawled: ${path}`)
            }

            // Only a completed crawl knows every page the sitemap lists: the website's other pages are no longer listed, now
            // excluded or beyond the page limit, so they and their search content are removed
            const removed = await dbSession
              .delete(websitePages)
              .where(
                and(
                  eq(websitePages.website_id, website.id),
                  notInArray(
                    websitePages.path,
                    pages.map(({ path }) => path)
                  )
                )
              )
              .returning({ id: websitePages.id })
            if (removed.length) console.log(`Removed ${removed.length} pages no longer in the sitemap: ${website.url}`)
            crawl.pagesRemoved(removed.length)

            // Pages left unchanged keep the time they were last processed, so only the website records when it was last crawled.
            // The crawl finishes at that same time, so the websites page shows it up to date as of Last Processed
            const finishedAt = new Date()
            await dbSession.update(websitesTable).set({ last_processed: finishedAt }).where(eq(websitesTable.id, website.id))
            await crawl.completed(finishedAt)

            console.log(`Website crawled: ${website.url}`)
          } catch (error) {
            await crawl.failed(error instanceof CrawlFailure ? error.message : UNEXPECTED_FAILURE)
            throw error
          }
        })

        if (!crawled) {
          console.warn(`Website skipped: it is already being crawled or its pages are being cleared: ${website.url}`)
          if (queuedCrawlId) {
            await failQueuedCrawl(dbSession, queuedCrawlId, "Another crawl or a clear of the website's pages was running")
          }
        }
      } catch (error) {
        console.error(`Error crawling website: ${website.url}`, error)
      }
    }

    if (outOfTime) {
      return {
        statusCode: 200,
        message: "Website crawler task stopped before its time limit: run it again to continue",
      }
    }

    return {
      statusCode: 200,
      message: "Website crawler task completed successfully",
    }
  } catch (error) {
    console.error("Error executing website crawler task", error)
    // Such as the websites failing to load: the event's crawl would otherwise read as never started
    if (event?.crawlId) await failQueuedCrawl(dbSession, event.crawlId, UNEXPECTED_FAILURE)

    return {
      statusCode: 500,
      message: "Error executing website crawler task",
    }
  } finally {
    await recordPendingUsage()
    await dbSession.$client.end()
  }
}

// A crawl's row, which the websites page shows its progress and outcome from. Failing to write it never fails the crawl: the
// failure is logged, and a crawl whose row couldn't be started or found writes none
class CrawlRecord {
  private pagesChecked = 0
  private pagesProcessed = 0
  private removed = 0
  private overLimit = 0
  private progressWrittenAt = 0

  private constructor(
    private readonly db: DbType,
    private readonly id: string | undefined
  ) {}

  // Marks the requested crawl running, or adds a running one when there is none. Lambda may retry a run its crash ended with the
  // same event, so a crawl already running, or recorded as ended, runs again from the start.
  //
  // The websites page shows the website's newest request, so a run Lambda starts late, or retries, after a newer one was
  // requested is recorded on that one while it is still queued, and the newer one's own run then finds the website locked.
  // Once the newer one has run, the late run is skipped: null. Either way the event's own crawl is superseded
  static async start(db: DbType, websiteId: string, crawlId: string | undefined, adminEmail: string | undefined) {
    const now = new Date()
    const running: CrawlValues = { status: "running", started_at: now }

    try {
      if (!crawlId) {
        const [crawl] = await db
          .insert(websiteCrawls)
          .values({ ...running, website_id: websiteId, admin_email: adminEmail })
          .returning({ id: websiteCrawls.id })
        return new CrawlRecord(db, crawl.id)
      }

      // No crawl is requested meanwhile: requests are refused while the website is locked
      const [newest] = await db
        .select({ id: websiteCrawls.id, status: websiteCrawls.status })
        .from(websiteCrawls)
        .where(eq(websiteCrawls.website_id, websiteId))
        .orderBy(desc(websiteCrawls.created_at))
        .limit(1)

      let runningId = crawlId
      if (newest && newest.id !== crawlId) {
        await db
          .update(websiteCrawls)
          .set({ status: "failed", error: SUPERSEDED, finished_at: now })
          .where(and(eq(websiteCrawls.id, crawlId), eq(websiteCrawls.website_id, websiteId), inArray(websiteCrawls.status, ["queued", "running"])))
        if (newest.status !== "queued") return null
        runningId = newest.id
      }

      const [crawl] = await db
        .update(websiteCrawls)
        .set({
          ...running,
          pages_total: null,
          pages_checked: 0,
          pages_processed: 0,
          pages_removed: 0,
          pages_over_limit: 0,
          error: null,
          finished_at: null,
        })
        .where(and(eq(websiteCrawls.id, runningId), eq(websiteCrawls.website_id, websiteId)))
        .returning({ id: websiteCrawls.id })

      if (!crawl) console.warn(`Website crawl not recorded: crawl ${runningId} was not found`)
      return new CrawlRecord(db, crawl?.id)
    } catch (error) {
      console.error("Website crawl not recorded: it couldn't be started", error)
      return new CrawlRecord(db, undefined)
    }
  }

  // The pages to check, and those left out by the page limit
  async setTotal(pagesTotal: number, pagesOverLimit: number) {
    this.overLimit = pagesOverLimit
    await this.write({ pages_total: pagesTotal, pages_over_limit: pagesOverLimit })
  }

  // Counts pages removed with their search content, written with the next progress
  pagesRemoved(count: number) {
    this.removed += count
  }

  // Counts a page checked, and processed when it was crawled again
  async pageChecked(processed: boolean) {
    this.pagesChecked++
    if (processed) this.pagesProcessed++
    if (!processed && Date.now() - this.progressWrittenAt < PROGRESS_INTERVAL_MS) return

    this.progressWrittenAt = Date.now()
    await this.write(this.progress())
  }

  async completed(finishedAt: Date) {
    await this.write({ ...this.progress(), status: "completed", finished_at: finishedAt })
  }

  async stopped() {
    await this.finish({ status: "stopped" })
  }

  async failed(error: string) {
    await this.finish({ status: "failed", error })
  }

  private progress() {
    return {
      pages_checked: this.pagesChecked,
      pages_processed: this.pagesProcessed,
      pages_removed: this.removed,
      pages_over_limit: this.overLimit,
    }
  }

  private async finish(values: CrawlValues) {
    await this.write({ ...this.progress(), ...values, finished_at: new Date() })
  }

  private async write(values: CrawlValues) {
    if (!this.id) return

    try {
      await this.db.update(websiteCrawls).set(values).where(eq(websiteCrawls.id, this.id))
    } catch (error) {
      console.error("Website crawl progress not recorded", error)
    }
  }
}

// Fails the event's crawl when it never ran. Failing to record it is only logged
async function failQueuedCrawl(db: DbType, crawlId: string, error: string) {
  try {
    await failQueuedWebsiteCrawl(db, crawlId, error)
  } catch (recordError) {
    console.error("Website crawl failure not recorded", recordError)
  }
}
