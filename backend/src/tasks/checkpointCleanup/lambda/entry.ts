import { findPrunableThreads, getCheckpointTableSizes, pruneThreads, type CheckpointCleanupCounts } from "@/ai/checkpointCleanup"
import { createDb } from "@/utils/db-setup"
import { Handler } from "aws-lambda"

// Only { "dryRun": false }, which the schedule sends, deletes. Any other event, such as a manual test invocation, only reports
// what would be deleted
export interface CheckpointCleanupEvent {
  dryRun?: boolean
}

// Threads with a checkpoint this recent are skipped, so the cleanup never races a turn in progress
const ACTIVE_WINDOW_MS = 24 * 60 * 60 * 1000
// Threads pruned per statement (one transaction each)
const BATCH_SIZE = 50
// Postgres cancels (and rolls back) any statement running longer than this, and the client gives up on one shortly after in
// case the connection itself is dead
const STATEMENT_TIMEOUT_MS = 4 * 60 * 1000
const QUERY_TIMEOUT_MS = STATEMENT_TIMEOUT_MS + 30 * 1000
// No batch starts with less time left than this, so even a batch cut off by the timeouts ends before the Lambda (or the
// container run's time budget) does. The next run continues with the remaining threads
const TIME_RESERVE_MS = QUERY_TIMEOUT_MS + 60 * 1000

const toMb = (bytes: number) => `${(bytes / 1024 / 1024).toFixed(2)} MB`

// Weekly: deletes the checkpoint data chats no longer need, keeping each thread's latest state (see checkpointCleanup.ts)
export const handler: Handler<CheckpointCleanupEvent | undefined> = (event, context) =>
  cleanUpCheckpoints(event, () => context.getRemainingTimeInMillis())

// The Lambda's run, and in the container installation the worker's weekly run and the checkpoint-cleanup command
// (src/container), with remainingTimeMs the time the run has left
export async function cleanUpCheckpoints(event: CheckpointCleanupEvent | undefined, remainingTimeMs: () => number) {
  const dryRun = event?.dryRun !== false
  // Queries run one at a time
  const dbSession = await createDb("lumi-checkpoint-cleanup", {
    max: 1,
    connectionTimeoutMillis: 10_000,
    statement_timeout: STATEMENT_TIMEOUT_MS,
    query_timeout: QUERY_TIMEOUT_MS,
  })
  const pool = dbSession.$client

  try {
    console.log(`Start checkpoint cleanup task${dryRun ? " (dry run: nothing is deleted)" : ""}`)

    // DELETE does not shrink the files: (auto)vacuum makes the space reusable for new rows, so the sizes stop growing rather than
    // drop. Logged once, as the trend across runs
    const tableSizes = await getCheckpointTableSizes(pool)
    for (const [table, bytes] of Object.entries(tableSizes)) {
      console.log(`${table} size: ${toMb(bytes)}`)
    }

    const activeSince = new Date(Date.now() - ACTIVE_WINDOW_MS)
    const threadIds = await findPrunableThreads(pool, activeSince)
    console.log(`Threads to prune: ${threadIds.length}`)

    const totals: CheckpointCleanupCounts = { threads: 0, checkpoints: 0, checkpointBytes: 0, writes: 0, writeBytes: 0, blobs: 0, blobBytes: 0 }
    let processed = 0

    while (processed < threadIds.length) {
      if (remainingTimeMs() < TIME_RESERVE_MS) {
        console.warn(`Stopping before the timeout, ${threadIds.length - processed} threads are left for the next run`)
        break
      }

      const batch = threadIds.slice(processed, processed + BATCH_SIZE)
      const counts = await pruneThreads(pool, batch, activeSince, dryRun)
      for (const key of Object.keys(totals) as (keyof CheckpointCleanupCounts)[]) {
        totals[key] += counts[key]
      }
      processed += batch.length
    }

    const freedBytes = totals.checkpointBytes + totals.writeBytes + totals.blobBytes

    console.log(`${dryRun ? "Would delete" : "Deleted"} from ${totals.threads} threads:`)
    console.log(`- checkpoints: ${totals.checkpoints} rows, ${toMb(totals.checkpointBytes)}`)
    console.log(`- checkpoint_writes: ${totals.writes} rows, ${toMb(totals.writeBytes)}`)
    console.log(`- checkpoint_blobs: ${totals.blobs} rows, ${toMb(totals.blobBytes)}`)
    console.log(`${dryRun ? "Space that would be freed" : "Space freed"} for reuse: ${toMb(freedBytes)}`)
    return { dryRun, complete: processed === threadIds.length, ...totals, freedBytes, tableSizes }
  } finally {
    await pool.end()
  }
}
