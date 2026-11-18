import { WebsitePageResult } from "@/generated/graphql"
import { LumiVectorStore } from "@/langchain/vector-stores/LumiVectorStore"
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

// A page website search found, with its closest passages first
export type WebsiteSearchResult = { title: string; url: string; passages: string[] }

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
  // same page are grouped, in the order of their closest chunk
  async searchWebsite(query: string): Promise<WebsiteSearchResult[]> {
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
      .limit(WEBSITE_SEARCH_K)

    console.log("Website search", { query, results: chunks.map(({ id, distance }) => ({ webpageId: id, distance })) })

    const closest = chunks.filter(({ distance }) => distance <= MAX_COSINE_DISTANCE)
    const pageIds = [...new Set(closest.flatMap(({ id }) => (id ? [id] : [])))]
    if (pageIds.length === 0) return []

    const pages = await this.dbSession
      .select({ id: schema.websitePages.id, title: schema.websitePages.title, path: schema.websitePages.path, websiteUrl: schema.websites.url })
      .from(schema.websitePages)
      .innerJoin(schema.websites, eq(schema.websites.id, schema.websitePages.website_id))
      .where(inArray(schema.websitePages.id, pageIds))
    const pagesById = new Map(pages.map((page) => [page.id, page]))

    // Grouped by page, in the order of their closest chunk. A page removed meanwhile is left out
    const results = new Map<string, WebsiteSearchResult>()
    for (const { id, content } of closest) {
      const page = id ? pagesById.get(id) : undefined
      if (!page || !content) continue
      let result = results.get(page.id)
      if (!result) {
        result = { title: page.title || page.path, url: pageUrlOf(page.websiteUrl, page.path), passages: [] }
        results.set(page.id, result)
      }
      result.passages.push(content)
    }
    return [...results.values()]
  }
}
