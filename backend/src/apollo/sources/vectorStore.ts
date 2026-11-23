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
// conversation's language it found: a page and its translation are usually close to the query alike
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

  // The website search the chat uses (searchWebsite), in the shape of the GraphQL searchWebsitePages query: each page with its
  // passages as documents
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
  // found too, and those in another language come after the rest
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

    console.log("Website search", { query, results: chunks.map(({ id, distance }) => ({ webpageId: id, distance })) })

    const closest = chunks.filter(({ distance }) => distance <= MAX_COSINE_DISTANCE)
    const pageIds = [...new Set(closest.flatMap(({ id }) => (id ? [id] : [])))]
    if (pageIds.length === 0) return []

    const pages = await this.dbSession
      .select({
        id: schema.websitePages.id,
        title: schema.websitePages.title,
        path: schema.websitePages.path,
        language: schema.websitePages.language,
        translationKey: schema.websitePages.translation_key,
        websiteId: schema.websites.id,
        websiteUrl: schema.websites.url,
      })
      .from(schema.websitePages)
      .innerJoin(schema.websites, eq(schema.websites.id, schema.websitePages.website_id))
      .where(inArray(schema.websitePages.id, pageIds))
    const pagesById = new Map(pages.map((page) => [page.id, page]))

    // The pages found in the conversation's language, by website and translation key, whose translations are left out
    const translationOf = (page: (typeof pages)[number]) => (page.translationKey ? `${page.websiteId} ${page.translationKey}` : undefined)
    const translated = new Set(pages.filter((page) => inLanguage(page, language)).map(translationOf))
    translated.delete(undefined)

    // Grouped by page, in the order of their closest chunk. A page removed meanwhile is left out
    const results = new Map<string, WebsiteSearchResult>()
    let chunkCount = 0
    for (const { id, content } of closest) {
      const page = id ? pagesById.get(id) : undefined
      if (!page || !content) continue
      if (!inLanguage(page, language) && translated.has(translationOf(page))) continue
      if (chunkCount++ === WEBSITE_SEARCH_K) break
      let result = results.get(page.id)
      if (!result) {
        result = { title: page.title || page.path, url: pageUrlOf(page.websiteUrl, page.path), language: page.language, passages: [] }
        results.set(page.id, result)
      }
      result.passages.push(content)
    }
    // Stable, so each group stays in the order of its closest chunk
    return [...results.values()].sort((a, b) => Number(!inLanguage(a, language)) - Number(!inLanguage(b, language)))
  }
}
