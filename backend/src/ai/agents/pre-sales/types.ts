import type { AgentContext } from "../types"

// Data sources the graph nodes and tools read from. The entity tools read through the shared services with a public context
export type PreSalesSources = Pick<AgentContext, "db" | "drizzle" | "embeddings">
