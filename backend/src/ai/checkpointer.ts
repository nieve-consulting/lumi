import { PostgresSaver } from "@langchain/langgraph-checkpoint-postgres"
import type { Pool } from "pg"

// LangGraph keeps its tables in their own schema so Drizzle never manages them. Thread ids are the threads.id uuids
// checkpointCleanup.ts queries these tables directly: check it whenever @langchain/langgraph-checkpoint-postgres is upgraded
export const CHECKPOINTER_SCHEMA = "langgraph"

// Only db/migrator.ts may call setup() (used by db/migrate-checkpointer.ts and the deploy-time migration Lambda), so request
// handling never races on schema changes
export function createCheckpointer(pool: Pool) {
  return new PostgresSaver(pool, undefined, { schema: CHECKPOINTER_SCHEMA })
}
