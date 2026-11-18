import type { Context } from "@/apollo/types"
import { Resolvers, WebsiteCrawl, WebsiteCrawlKind, WebsiteCrawlStatus, type WebsiteInput } from "@/generated/graphql"
import { ServiceError } from "@/services/errors"
import { checkWebsiteUrls, normalizeWebsiteUrl } from "@/services/websiteUrls"
import { startWebsiteCrawler } from "@/tasks/websiteCrawler/dispatch"
import { GraphQLError } from "graphql"
import { z } from "zod"

import { asGraphQLError, checkAdminInput } from "../validation"

const updateWebsitePagesRules = z.object({
  id: z.uuid(),
  adminEmail: z.email().max(320).nullish(),
  kind: z.enum(WebsiteCrawlKind).nullish(),
})

// Shown on a crawl the crawler never picked up because starting it failed: invoking its Lambda, or the worker refused it
const CRAWLER_NOT_STARTED = "The crawler couldn't be started"

type LatestCrawlRow = Awaited<ReturnType<Context["dataSources"]["db"]["getLatestWebsiteCrawls"]>>[number]

// A crawl reports running only while it holds the website's lock, which its connection closing releases however its Lambda
// ended, so one killed without recording its outcome is interrupted. One queued for longer than it takes to start never started
function crawlStatus(crawl: LatestCrawlRow) {
  switch (crawl.status) {
    case "queued":
      return crawl.start_overdue ? WebsiteCrawlStatus.NotStarted : WebsiteCrawlStatus.Queued
    case "running":
      return crawl.lock_held ? WebsiteCrawlStatus.Running : WebsiteCrawlStatus.Interrupted
    case "completed":
      return WebsiteCrawlStatus.Completed
    case "stopped":
      return WebsiteCrawlStatus.Stopped
    case "failed":
      return WebsiteCrawlStatus.Failed
  }
}

function toWebsiteCrawl(crawl: LatestCrawlRow): WebsiteCrawl {
  return {
    id: crawl.id,
    kind: crawl.kind === "reprocess" ? WebsiteCrawlKind.Reprocess : WebsiteCrawlKind.Update,
    status: crawlStatus(crawl),
    pagesTotal: crawl.pages_total,
    pagesChecked: crawl.pages_checked,
    pagesProcessed: crawl.pages_processed,
    pagesRemoved: crawl.pages_removed,
    pagesOverLimit: crawl.pages_over_limit,
    error: crawl.error,
    createdAt: crawl.created_at.toISOString(),
    startedAt: crawl.started_at?.toISOString(),
    finishedAt: crawl.finished_at?.toISOString(),
  }
}

// The websites with their latest crawl, read for all of them in one query: the websites page polls them during a crawl
async function getWebsites(context: Context) {
  const [websites, crawls] = await Promise.all([context.dataSources.db.getWebsites(), context.dataSources.db.getLatestWebsiteCrawls()])
  const latestCrawls = new Map(crawls.map((crawl) => [crawl.website_id, toWebsiteCrawl(crawl)]))

  return websites.map((website) => ({
    ...website,
    created_at: website.created_at.toISOString(),
    updated_at: website.updated_at.toISOString(),
    last_processed: website.last_processed?.toISOString(),
    latestCrawl: latestCrawls.get(website.id),
  }))
}

async function getWebsite(id: string, context: Context) {
  const website = await context.dataSources.db.getWebsiteById(id)
  if (!website) {
    throw new GraphQLError("Website not found")
  }
  const [crawl] = await context.dataSources.db.getLatestWebsiteCrawls([website.id])

  return {
    ...website,
    created_at: website.created_at.toISOString(),
    updated_at: website.updated_at.toISOString(),
    last_processed: website.last_processed?.toISOString(),
    latestCrawl: crawl && toWebsiteCrawl(crawl),
  }
}

async function deleteWebsite(id: string, context: Context) {
  await checkWebsiteExists(id, context)
  return context.dataSources.db.deleteWebsite(id)
}

async function clearProcessedWebsitePages(id: string, context: Context) {
  await checkWebsiteExists(id, context)
  try {
    return await context.dataSources.db.clearProcessedWebsitePages(id)
  } catch (error) {
    asGraphQLError(error)
  }
}

// Starts the crawl unless one is running or starting: the crawler would skip the website while the admin is told it started.
// The crawl is queued first, so the websites page shows it starting, and the crawler records its progress and outcome on it.
// Queueing it also checks the website exists
async function updateWebsitePages(id: string, adminEmail: string | undefined, kind: WebsiteCrawlKind, context: Context) {
  let crawl
  try {
    crawl = await context.dataSources.db.queueWebsiteCrawl(id, kind === WebsiteCrawlKind.Reprocess ? "reprocess" : "update", adminEmail)
  } catch (error) {
    asGraphQLError(error)
  }

  try {
    return await startWebsiteCrawler({ websiteId: crawl.websiteId, crawlId: crawl.crawlId, adminEmail }, context.dataSources.aws)
  } catch (error) {
    // A crawl the crawler will never pick up fails rather than show as starting. Failing to record it keeps the start's error
    await context.dataSources.db.failQueuedWebsiteCrawl(crawl.crawlId, CRAWLER_NOT_STARTED).catch((recordError) => {
      console.error("Couldn't record that the website crawler didn't start", recordError)
    })
    throw error
  }
}

// The address and the sitemap must be public http(s) URLs the crawler may fetch (BAD_USER_INPUT with the field, url or
// sitemap, otherwise). The address is saved without trailing slashes, so the sitemap and page URLs built from it stay right
function websiteInput(input: WebsiteInput): WebsiteInput {
  try {
    checkWebsiteUrls(input)
  } catch (error) {
    // The field (url or sitemap) lets the form show the message next to it
    if (error instanceof ServiceError) {
      throw new GraphQLError(error.message, { extensions: { code: "BAD_USER_INPUT", field: error.details?.field } })
    }
    throw error
  }
  return { ...input, url: normalizeWebsiteUrl(input.url), sitemap: input.sitemap.trim() }
}

async function checkWebsiteExists(id: string, context: Context) {
  if (!(await context.dataSources.db.getWebsiteById(id))) {
    throw new GraphQLError("Website not found", { extensions: { code: "BAD_USER_INPUT" } })
  }
}

export const websiteResolvers: Resolvers<Context> = {
  Query: {
    websites: async (_, __, context) => getWebsites(context),
    website: async (_, { id }, context) => getWebsite(id, context),
    searchWebsitePages: async (_, { query }, context) => context.dataSources.embeddings.searchWebsitePages(query),
  },
  Mutation: {
    createWebsite: async (_, { input }, context) => {
      const result = await context.dataSources.db.createWebsite(websiteInput(input))
      return result.id
    },
    updateWebsite: async (_, { id, input }, context) => context.dataSources.db.updateWebsite(id, websiteInput(input)),
    deleteWebsite: async (_, { id }, context) => deleteWebsite(id, context),
    clearProcessedWebsitePages: async (_, { id }, context) => clearProcessedWebsitePages(id, context),
    updateWebsitePages: async (_, args, context) => {
      checkAdminInput(updateWebsitePagesRules, args)
      return updateWebsitePages(args.id, args.adminEmail ?? undefined, args.kind ?? WebsiteCrawlKind.Update, context)
    },
  },
}
