import process from "node:process"

import { describeAppliedMigrations, migrateSchema } from "./migrator"
import { createScriptPool } from "./script-pool"

// Applies the Drizzle migrations by hand, through db/migrator.ts. Deploys run the same migration from the migration Lambda
// (src/tasks/dbMigrations/lambda/entry.ts)
;(async () => {
  const pool = await createScriptPool("lumi-migrate")

  try {
    // Applies only the migrations not yet recorded in the database
    console.log(describeAppliedMigrations(await migrateSchema(pool, "./db/migrations")))
  } finally {
    // Don't forget to close the connection, otherwise the script will hang
    await pool.end()
  }
})().catch((error) => {
  console.error("Error migrating the database:", error)
  process.exit(1)
})
