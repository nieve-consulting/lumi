import path from "node:path"
import { createDb } from "@/utils/db-setup"
import { describeAppliedMigrations, migrateCheckpointer, migrateSchema, MIGRATION_POOL_OPTIONS } from "@db/migrator"
import { Handler } from "aws-lambda"

// Where the bundle carries the Drizzle migrations: the deployment that bundles this Lambda copies the SQL files and the journal
// from db/migrations into migrations/ beside the bundled handler, since Drizzle's migrator reads them from disk (backend/README.md)
const MIGRATIONS_FOLDER = path.join(__dirname, "migrations")

// No statement may run longer than the time the run has left when it connects, less this reserve. Postgres then cancels and
// rolls back a migration that would outlast the Lambda rather than keep running it, with its locks, after the Lambda is gone
const TIMEOUT_RESERVE_MS = 60 * 1000

// Migrates the database from inside the VPC. The deployment runs it during every deploy that changes it, which adding a
// migration does, before any other Lambda in the VPC is updated, so new code never starts against an older schema. A thrown
// error fails the deploy, which then rolls back to the previous code. Invoking it by hand reruns the deployed code's migrations
export const handler: Handler = async (_event, context) => {
  // Two connections: one holds the migration lock (db/migrator.ts) while the other migrates. Closed at the end, since the next
  // run is the next deploy's. A database that can't be reached fails the run in seconds rather than at the Lambda's timeout
  const dbSession = await createDb("lumi-migrate", {
    ...MIGRATION_POOL_OPTIONS,
    max: 2,
    connectionTimeoutMillis: 10_000,
    statement_timeout: context.getRemainingTimeInMillis() - TIMEOUT_RESERVE_MS,
    // A transaction left open by a run that died mid-way gives its locks back
    idle_in_transaction_session_timeout: TIMEOUT_RESERVE_MS,
  })
  const pool = dbSession.$client

  try {
    const applied = await migrateSchema(pool, MIGRATIONS_FOLDER)
    console.log(`Schema: ${describeAppliedMigrations(applied)}`)

    await migrateCheckpointer(pool)
    console.log("Checkpointer: completed")

    return { applied }
  } finally {
    await pool.end()
  }
}
