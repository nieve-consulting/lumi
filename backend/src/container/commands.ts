import { envPoolConfig } from "@/utils/db-setup"
import { Pool } from "pg"

// Helpers shared by the container's one-off commands (oneOff.ts, status.ts, businessExport.ts) and the worker's scheduled
// runs (worker.ts)

// A thread id or an upload key, as Postgres prints a uuid (any case accepted)
export const UUID_PATTERN = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}"

// The message of a failure, with what Postgres said about it, and never the connection settings
export function describeError(error: unknown) {
  const { message, code, detail } = error as { message?: string; code?: string; detail?: string }
  return [message ?? String(error), code && `(Postgres error ${code})`, detail].filter(Boolean).join(" ")
}

// A pool of one connection with the DB_* variables, for work that runs its queries one at a time. With `statementTimeoutMs`,
// Postgres cancels any statement running longer, and the client gives up shortly after in case the connection itself is dead
export function createCommandPool(applicationName: string, { statementTimeoutMs, label }: { statementTimeoutMs?: number; label?: string } = {}) {
  const pool = new Pool({
    ...envPoolConfig(applicationName),
    max: 1,
    connectionTimeoutMillis: 10_000,
    ...(statementTimeoutMs ? { statement_timeout: statementTimeoutMs, query_timeout: queryTimeoutMs(statementTimeoutMs) } : {}),
  })
  pool.on("error", (error) => console.warn(`${label ? `${label}: a` : "A"} database connection failed:`, error.message))
  return pool
}

// How long the client waits for a statement bounded by `statementTimeoutMs`
export const queryTimeoutMs = (statementTimeoutMs: number) => statementTimeoutMs + 30_000

// Lumi's knowledge search needs pgvector, which the bundled database's image has and an external server may not
export const VECTOR_MISSING =
  "pgvector isn't available on this PostgreSQL server, and Lumi needs it: install the vector extension on the server (managed services offer it as an option), then run migrate"
