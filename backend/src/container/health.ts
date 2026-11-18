import path from "node:path"
import { CHECKPOINTER_SCHEMA } from "@/ai/checkpointer"
import { envPoolConfig } from "@/utils/db-setup"
import { APPLIED_MIGRATIONS_TABLE, readMigrationJournal } from "@db/migrator"
import { Pool } from "pg"

// GET /health of the api, agents and worker: whether the database is reachable and migrated. 200 when every check is ok, 503
// otherwise. Two short queries at most, each bounded, and nothing secret: no connection details, errors or stack traces

export type DatabaseCheck = "ok" | "unreachable"
export type MigrationCheck = "ok" | "migrations pending" | "not initialized" | "unknown"

export interface Health {
  status: "ok" | "unavailable"
  checks: { database: DatabaseCheck; schema: MigrationCheck; checkpointer: MigrationCheck }
}

const CHECK_TIMEOUT_MS = 3_000

// The tables LangGraph's setup() creates
export const CHECKPOINTER_TABLES = ["checkpoints", "checkpoint_blobs", "checkpoint_writes", "checkpoint_migrations"]

// The bundled migrations, next to the bundle in the image: dist/container/lumi.cjs and db/migrations
export const MIGRATIONS_FOLDER = path.resolve(__dirname, "../../db/migrations")

// The `when` of the newest bundled migration, which Drizzle records as created_at once it is applied. The migrator applies
// those newer than the newest recorded, so a database is up to date once it records this one or a later one
function latestBundledMigration(): number {
  return Math.max(...readMigrationJournal(MIGRATIONS_FOLDER).map((entry) => entry.when))
}

function withTimeout<T>(promise: Promise<T>): Promise<T> {
  let timer: NodeJS.Timeout | undefined
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error("Health check timed out")), CHECK_TIMEOUT_MS)
  })
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer))
}

// A pool of its own, so a busy service still answers its health check, and a check never waits on a dead connection for long
export function createHealthCheck(applicationName: string) {
  const latestMigration = latestBundledMigration()
  const pool = new Pool({
    ...envPoolConfig(`${applicationName}-health`),
    max: 1,
    idleTimeoutMillis: 60_000,
    connectionTimeoutMillis: CHECK_TIMEOUT_MS,
    query_timeout: CHECK_TIMEOUT_MS,
    statement_timeout: CHECK_TIMEOUT_MS,
  })
  pool.on("error", (error) => console.warn("Health check: a database connection failed:", error.message))

  return async function checkHealth(): Promise<Health> {
    let tables
    try {
      const { rows } = await withTimeout(
        pool.query<{ migrations: boolean; checkpointer_tables: number }>({
          text: `select
            to_regclass('${APPLIED_MIGRATIONS_TABLE}') is not null as migrations,
            (select count(*)::int from pg_tables where schemaname = $1 and tablename = any($2::text[])) as checkpointer_tables`,
          values: [CHECKPOINTER_SCHEMA, CHECKPOINTER_TABLES],
        })
      )
      tables = rows[0]
    } catch (error) {
      console.warn("Health check: the database is unreachable:", error instanceof Error ? error.message : error)
      return { status: "unavailable", checks: { database: "unreachable", schema: "unknown", checkpointer: "unknown" } }
    }

    const checkpointer: MigrationCheck = tables.checkpointer_tables === CHECKPOINTER_TABLES.length ? "ok" : "not initialized"
    let schema: MigrationCheck = "not initialized"
    if (tables.migrations) {
      try {
        const { rows } = await withTimeout(
          pool.query<{ latest: string | null }>(`select max(created_at)::text as latest from ${APPLIED_MIGRATIONS_TABLE}`)
        )
        const latest = rows[0]?.latest
        schema = latest === null || latest === undefined ? "not initialized" : Number(latest) >= latestMigration ? "ok" : "migrations pending"
      } catch (error) {
        console.warn("Health check: the applied migrations couldn't be read:", error instanceof Error ? error.message : error)
        return { status: "unavailable", checks: { database: "unreachable", schema: "unknown", checkpointer } }
      }
    }

    const ok = schema === "ok" && checkpointer === "ok"
    return { status: ok ? "ok" : "unavailable", checks: { database: "ok", schema, checkpointer } }
  }
}
