import { WebsitePageResult } from "@/generated/graphql"
import { LumiVectorStore } from "@/langchain/vector-stores/LumiVectorStore"
import { inLanguage } from "@/services/pageLanguages"
import { pageUrlOf } from "@/services/websiteUrls"
import * as schema from "@db/schema"
import { and, asc, cosineDistance, eq, inArray, isNotNull, sql } from "drizzle-orm"
import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres"
import type { Pool } from "pg"

// Cosine distance cutoff (similarity = 1 - distance). Deliberately loose: it only drops clearly unrelated chunks.
// Tighten it once the logged distances show where relevant results sit.
const MAX_COSINE_DISTANCE = 0.8

// Chunks website search returns: the closest, grouped by page
const WEBSITE_SEARCH_K = 5

// Chunks website search reads to pick them, so it still has WEBSITE_SEARCH_K once it left out pages whose translation into the
// conversation's language it returns: a page and its translation are usually close to the query alike
const WEBSITE_SEARCH_CANDIDATES = WEBSITE_SEARCH_K * 3

// A page website search found, with its closest passages first, and its language as an ISO 639-1 code when it is known
export type WebsiteSearchResult = { title: string; url: string; language: string | null; passages: string[] }

export default class EmbeddingSource {
  private dbSession: NodePgDatabase<typeof schema>
  private vectorStore: LumiVectorStore

  constructor(dbPool: Pool) {
    this.dbSession = drizzle(dbPool, { schema })
    this.vectorStore = new LumiVectorStore(dbPool)
  }

  // Website search (searchWebsite) without a conversation's language, in the shape of the GraphQL searchWebsitePages query: each
  // page with its passages as documents, closest first in any language. The chat passes its language, so it can return fewer
  // pages in other languages and in another order
  async searchWebsitePages(query: string): Promise<WebsitePageResult[]> {
    const results = await this.searchWebsite(query)
    return results.map(({ title, url, passages }) => ({
      title,
      url,
      documents: passages.map((pageContent) => ({ pageContent, metadata: {} })),
    }))
  }

  // Searches the pages of the business's websites, ranked by the cosine distance of their chunks to the query. Chunks of the
  // same page are grouped, in the order of their closest chunk. With the conversation's language (an ISO 639-1 code), a page in
  // another language is left out when its translation into the conversation's language (or one whose language isn't known) is
  // returned too, on any of the business's websites, and those in another language come after the rest
  async searchWebsite(query: string, language?: string): Promise<WebsiteSearchResult[]> {
    // Embedded with the store's embeddings, which report the usage to the conversation
    const vector = await this.vectorStore.embeddings.embedQuery(query)
    const distance = cosineDistance(schema.websitePageVectors.vector, vector)

    const chunks = await this.dbSession
      .select({
        id: schema.websitePageVectors.webpage_id,
        content: schema.websitePageVectors.content,
        distance: sql<number>`${distance}`.mapWith(Number),
      })
      .from(schema.websitePageVectors)
      .where(and(isNotNull(schema.websitePageVectors.webpage_id), isNotNull(schema.websitePageVectors.vector)))
      .orderBy(asc(distance))
      .limit(WEBSITE_SEARCH_CANDIDATES)

    // Logged with the chunks it returned, so the distances show where relevant results sit
    const log = (returned: Set<(typeof chunks)[number]>) =>
      console.log("Website search", {
        query,
        language,
        results: chunks.map((chunk) => ({ webpageId: chunk.id, distance: chunk.distance, returned: returned.has(chunk) })),
      })

    const closest = chunks.filter(({ distance }) => distance <= MAX_COSINE_DISTANCE)
    const pageIds = [...new Set(closest.flatMap(({ id }) => (id ? [id] : [])))]
    if (pageIds.length === 0) {
      log(new Set())
      return []
    }

    const pages = await this.dbSession
      .select({
        id: schema.websitePages.id,
        title: schema.websitePages.title,
        path: schema.websitePages.path,
        language: schema.websitePages.language,
        translationKey: schema.websitePages.translation_key,
        websiteUrl: schema.websites.url,
      })
      .from(schema.websitePages)
      .innerJoin(schema.websites, eq(schema.websites.id, schema.websitePages.website_id))
      .where(inArray(schema.websitePages.id, pageIds))
    const pagesById = new Map(pages.map((page) => [page.id, page]))

    // A page removed meanwhile is left out
    const candidates = closest.flatMap((chunk) => {
      const page = chunk.id ? pagesById.get(chunk.id) : undefined
      return page && chunk.content ? [{ chunk, page, content: chunk.content }] : []
    })

    // The closest WEBSITE_SEARCH_K chunks, without those of a page in another language whose translation into the conversation's
    // language (or one whose language isn't known) is among them. Only a translation it returns leaves a page out, so the closest
    // page isn't lost to a translation too far down to be returned. Leaving pages out moves later chunks up and keeps those
    // already picked, so it repeats until no page picked has its translation picked too
    const leftOut = new Set<string>()
    let picked = candidates.slice(0, WEBSITE_SEARCH_K)
    for (;;) {
      const translated = new Set(picked.flatMap(({ page }) => (inLanguage(page, language) && page.translationKey ? [page.translationKey] : [])))
      const translations = picked.filter(({ page }) => !inLanguage(page, language) && !!page.translationKey && translated.has(page.translationKey))
      if (translations.length === 0) break
      for (const { page } of translations) leftOut.add(page.id)
      picked = candidates.filter(({ page }) => !leftOut.has(page.id)).slice(0, WEBSITE_SEARCH_K)
    }
    log(new Set(picked.map(({ chunk }) => chunk)))

    // Grouped by page, in the order of their closest chunk
    const results = new Map<string, WebsiteSearchResult>()
    for (const { page, content } of picked) {
      let result = results.get(page.id)
      if (!result) {
        result = { title: page.title || page.path, url: pageUrlOf(page.websiteUrl, page.path), language: page.language, passages: [] }
        results.set(page.id, result)
      }
      result.passages.push(content)
    }
    // Pages in another language come last. Stable, so each group stays in the order of its closest chunk
    return [...results.values()].sort((a, b) => Number(!inLanguage(a, language)) - Number(!inLanguage(b, language)))
  }
}
