import { UsageReportingEmbeddings } from "@/langchain/embeddings/UsageReportingEmbeddings"
import { websitePageVectors } from "@db/schema"
import type { EmbeddingsInterface } from "@langchain/core/embeddings"
import { PGVectorStore, type DistanceStrategy } from "@langchain/pgvector"
import { getTableName } from "drizzle-orm"
import type { Pool } from "pg"

// Model of the stored vectors, which searches must embed their query with too. Its dimensions are the vector column's
export const VECTOR_EMBEDDINGS = { model: "text-embedding-3-small", dimensions: 1536 }

const embeddings = new UsageReportingEmbeddings(VECTOR_EMBEDDINGS)

// The table and its HNSW index are created by the Drizzle migrations (websitePageVectors in db/schema.ts)
const pgConfig = {
  tableName: getTableName(websitePageVectors),
  columns: {
    idColumnName: websitePageVectors.id.name,
    vectorColumnName: websitePageVectors.vector.name,
    contentColumnName: websitePageVectors.content.name,
    metadataColumnName: websitePageVectors.metadata.name,
  },
  // supported distance strategies: cosine (default), innerProduct, or euclidean
  distanceStrategy: "cosine" as DistanceStrategy,
  // return raw distances from similaritySearchWithScore (lower = more similar)
  scoreNormalization: "distance" as const,
}

export class LumiVectorStore extends PGVectorStore {
  // The website crawler passes its own VECTOR_EMBEDDINGS instance to record their usage
  constructor(dbPool: Pool, storeEmbeddings: EmbeddingsInterface = embeddings) {
    super(storeEmbeddings, {
      pool: dbPool,
      ...pgConfig,
    })
  }
}
