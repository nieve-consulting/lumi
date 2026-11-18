import process from "node:process"

import { CHECKPOINTER_SCHEMA } from "../src/ai/checkpointer"
import { migrateCheckpointer } from "./migrator"
import { createScriptPool } from "./script-pool"

// Creates or upgrades the LangGraph checkpoint tables by hand, through db/migrator.ts. Deploys run the same migration from the
// migration Lambda (src/tasks/dbMigrations/lambda/entry.ts)
;(async () => {
  const pool = await createScriptPool("lumi-checkpointer-migrate")

  try {
    await migrateCheckpointer(pool)
    console.log(`Checkpointer tables are up to date in schema "${CHECKPOINTER_SCHEMA}"`)
  } finally {
    // Close the connection, otherwise the script will hang
    await pool.end()
  }
})().catch((error) => {
  console.error("Error migrating the checkpointer tables:", error)
  process.exit(1)
})
