import fs from "node:fs"
import path from "node:path"
import { drizzle } from "drizzle-orm/node-postgres"
import { migrate } from "drizzle-orm/node-postgres/migrator"
import type { Pool, PoolConfig } from "pg"

import { createCheckpointer } from "../src/ai/checkpointer"

// The migrations applied by the db/migrate*.ts scripts, against a local database or through a tunnel to a deployed one, by the
// container's migrate command and by the deploy-time migration Lambda (src/tasks/dbMigrations/lambda/entry.ts) inside the VPC.
// Both kinds are idempotent, so a run with nothing pending changes nothing. Each takes the migration lock on a connection of its
// own, so the pool must allow at least two

// Every pool that migrates sets these. A migration waiting for a lock queues ahead of every later query on its table, so it
// gives up after a few seconds rather than stall the Lambdas serving requests; the deploy fails and the next one retries it
export const MIGRATION_POOL_OPTIONS = { lock_timeout: 10_000 } satisfies PoolConfig

// Any fixed key: only migration runs take it
const MIGRATION_LOCK_KEY = 74_201_901

// Where Drizzle's node-postgres migrator records the migrations it has applied, one row each
const MIGRATIONS_SCHEMA = "drizzle"
const MIGRATIONS_TABLE = "__drizzle_migrations"
export const APPLIED_MIGRATIONS_TABLE = `${MIGRATIONS_SCHEMA}.${MIGRATIONS_TABLE}`

export interface JournalEntry {
  tag: string
  when: number
}

// The migrations in migrationsFolder, oldest first. Each applied one's row has the `when` of its journal entry as created_at,
// which is how a row gets its migration's name. Drizzle's migrator applies those newer than the newest row
export function readMigrationJournal(migrationsFolder: string): JournalEntry[] {
  const journal: { entries: JournalEntry[] } = JSON.parse(fs.readFileSync(path.join(migrationsFolder, "meta", "_journal.json"), "utf8"))
  return journal.entries.map(({ tag, when }) => ({ tag, when })).sort((a, b) => a.when - b.when)
}

function readMigrationNames(migrationsFolder: string): Map<number, string> {
  return new Map(readMigrationJournal(migrationsFolder).map((entry) => [entry.when, entry.tag]))
}

// The created_at of each applied migration, oldest first. The table only exists once a migration has run, so an
// undefined_table error (42P01) means none have
export async function listAppliedMigrations(pool: Pool): Promise<number[]> {
  try {
    const result = await pool.query<{ created_at: string }>(`select created_at from "${MIGRATIONS_SCHEMA}"."${MIGRATIONS_TABLE}" order by created_at`)
    return result.rows.map((row) => Number(row.created_at))
  } catch (error) {
    if ((error as { code?: string }).code === "42P01") {
      return []
    }
    throw error
  }
}

// Neither Drizzle's migrator nor LangGraph's setup() locks anything, so two overlapping runs (a deploy's and one by hand, or a
// retried invocation) would both apply the same migrations. A second run fails at once instead of waiting. The lock lives in a
// connection held for the run and closed after it, which releases it however the run ended
async function withMigrationLock<T>(pool: Pool, run: () => Promise<T>): Promise<T> {
  const lockClient = await pool.connect()

  try {
    const { rows } = await lockClient.query<{ locked: boolean }>("select pg_try_advisory_lock($1) as locked", [MIGRATION_LOCK_KEY])
    if (!rows[0]?.locked) {
      throw new Error("Another migration run holds the migration lock; run again once it has finished")
    }

    return await run()
  } finally {
    lockClient.release(true)
  }
}

// Bootstrap today's spending when the usage recorded today has no daily total yet: code that predates the independent daily
// total, still running until the deploy that ships it, records usage without one. This data backfill preserves that usage
// without hand-written SQL migrations. It runs only while today has no total, which also finishes a run whose backfill
// failed; otherwise it does nothing, so later runs neither read the usage nor lock the table. Older migration folders can be
// used by operator tooling, so it only runs when the table exists.
// Lock the aggregate before reading usage. A new usage transaction either committed both its detail and daily total before
// this lock, or commits after this backfill and adds its cost then. No visitor-table write locks are needed, so this cannot
// deadlock with deletion's thread-first locks. greatest() means a rerun never refunds deleted usage or counts it twice.
async function backfillDailyConversationSpend(pool: Pool) {
  const client = await pool.connect()
  let failure: Error | undefined
  try {
    await client.query("begin")
    const { rows } = await client.query<{ needed: boolean }>(
      `select to_regclass('public.daily_conversation_spend') is not null
        and not exists (select from public.daily_conversation_spend where day = (now() at time zone 'UTC')::date) as needed`
    )
    if (rows[0].needed) {
      await client.query("lock table public.daily_conversation_spend in share row exclusive mode")
      // thread_usage keeps timestamps without a time zone, written in the session's time zone. Comparing them with the UTC
      // day's bounds as timestamptz reads them in that same time zone, so the window is right whatever the server's setting
      await client.query(`
        insert into public.daily_conversation_spend (day, cost)
        select (now() at time zone 'UTC')::date, coalesce(sum(cost), 0)
        from public.thread_usage
        where created_at >= (date_trunc('day', now() at time zone 'UTC') at time zone 'UTC')
          and created_at < ((date_trunc('day', now() at time zone 'UTC') + interval '1 day') at time zone 'UTC')
        on conflict (day) do update
        set cost = greatest(daily_conversation_spend.cost, excluded.cost)
      `)
    }
    await client.query("commit")
  } catch (error) {
    failure = error instanceof Error ? error : new Error(String(error))
    // A failed rollback (the connection is gone) must not hide why the backfill failed
    await client.query("rollback").catch(() => undefined)
    throw error
  } finally {
    // A connection whose transaction failed is closed rather than returned to the pool
    client.release(failure)
  }
}

// The schema migrations of the run stay applied; its message names them and the reason the backfill failed, since the
// migrate command and the Lambda log only the message
export class SpendBackfillError extends Error {
  constructor(applied: string[], cause: unknown) {
    const { message, code, detail } = cause as { message?: string; code?: string; detail?: string }
    const reason = [message ?? String(cause), code && `(Postgres error ${code})`, detail].filter(Boolean).join(" ")
    super(
      `${applied.length > 0 ? `Schema migrations ${applied.join(", ")} were applied` : "No schema migration was pending"}, but the daily spending backfill failed: ${reason}. Run migrate again to finish.`,
      { cause }
    )
    this.name = "SpendBackfillError"
  }
}

// Applies the Drizzle migrations in migrationsFolder not yet recorded in the database and returns their names in order. Drizzle
// applies them all in one transaction, so when one fails none of this run's stay applied
export async function migrateSchema(pool: Pool, migrationsFolder: string): Promise<string[]> {
  return withMigrationLock(pool, async () => {
    const appliedBefore = new Set(await listAppliedMigrations(pool))

    await migrate(drizzle(pool), { migrationsFolder })

    const names = readMigrationNames(migrationsFolder)
    const applied = (await listAppliedMigrations(pool))
      .filter((createdAt) => !appliedBefore.has(createdAt))
      .map((createdAt) => names.get(createdAt) ?? `unknown migration (created_at ${createdAt})`)

    try {
      await backfillDailyConversationSpend(pool)
    } catch (error) {
      throw new SpendBackfillError(applied, error)
    }

    return applied
  })
}

// How the script and the Lambda log what migrateSchema applied
export function describeAppliedMigrations(applied: string[]): string {
  if (applied.length === 0) {
    return "No pending migrations; nothing to apply."
  }

  return [`Applied ${applied.length} migration(s):`, ...applied.map((name) => `  ${name}`)].join("\n")
}

// setup() is LangGraph's own versioned migration runner: it creates the schema when missing and applies only the checkpoint
// migrations not yet recorded in checkpoint_migrations. Nothing but the db:checkpointer:migrate script and the migration
// Lambda may call it, so request handling never races on schema changes
export async function migrateCheckpointer(pool: Pool): Promise<void> {
  await withMigrationLock(pool, () => createCheckpointer(pool).setup())
}
