import type AwsDataSource from "@/apollo/sources/aws"
import type DbDataSource from "@/apollo/sources/dbDataSource"
import type GCalendarSource from "@/apollo/sources/gCalendar"
import type EmbeddingSource from "@/apollo/sources/vectorStore"
import type { DbType } from "@db/db"
import type { Pool } from "pg"

// Everything a route handler needs. The Lambda keeps the database in module scope across invocations
export interface AgentContext {
  db: DbDataSource
  drizzle: DbType
  pool: Pool
  embeddings: EmbeddingSource
  gCalendar: GCalendarSource
  aws: AwsDataSource
  // Aborted when the client disconnects
  signal: AbortSignal
}

export type RouteParams = Record<string, string>

export interface Route {
  method: "GET" | "POST"
  // Path below the agent segment, e.g. "threads/:id/messages". An empty path is the agent root
  path: string
  handler: (request: Request, context: AgentContext, params: RouteParams) => Promise<Response>
}

// Public routes are served under /agents/<agent>/..., admin routes under /admin/<agent>/... behind the API key
export interface AgentRoutes {
  public: Route[]
  admin: Route[]
}
