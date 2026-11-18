import { TASKS } from "@langchain/langgraph-checkpoint"
import type { Pool } from "pg"

import { CHECKPOINTER_SCHEMA } from "./checkpointer"

// Prunes the checkpoint tables of @langchain/langgraph-checkpoint-postgres with raw SQL, so these queries depend on that
// package's table layout and on how its getTuple() loads a checkpoint. Check these queries whenever the lockfile moves it to a
// new version, including updates within its range.
//
// Chats only ever read the latest checkpoint of a thread (getState()), never its history. Per thread and namespace the cleanup
// keeps the latest checkpoint (the highest checkpoint_id, as getTuple() picks it), its pending writes and the blobs its
// channel_versions reference, which may have been written many steps earlier. Everything else is deleted, and so is all the
// data of threads with no row in public.threads (no foreign key reaches the langgraph schema).
//
// This only holds while every state channel stores its full value in the checkpoint. A DeltaChannel (DeltaValue in a
// StateSchema) rebuilds its value by replaying the writes of ancestor checkpoints, which this cleanup deletes.

const CHECKPOINTS = `"${CHECKPOINTER_SCHEMA}".checkpoints`
const CHECKPOINT_BLOBS = `"${CHECKPOINTER_SCHEMA}".checkpoint_blobs`
const CHECKPOINT_WRITES = `"${CHECKPOINTER_SCHEMA}".checkpoint_writes`
const CHECKPOINT_TABLES = [CHECKPOINTS, CHECKPOINT_BLOBS, CHECKPOINT_WRITES]

export interface CheckpointCleanupCounts {
  threads: number
  checkpoints: number
  checkpointBytes: number
  writes: number
  writeBytes: number
  blobs: number
  blobBytes: number
}

export type CheckpointTableSizes = Record<string, number>

// On-disk size of each table with its indexes and TOAST data
export async function getCheckpointTableSizes(pool: Pool): Promise<CheckpointTableSizes> {
  const { rows } = await pool.query<{ table: string; bytes: string }>(
    `SELECT t AS table, pg_total_relation_size(t::regclass) AS bytes FROM unnest($1::text[]) AS t`,
    [CHECKPOINT_TABLES]
  )

  return Object.fromEntries(rows.map((row) => [row.table, Number(row.bytes)]))
}

// Threads with data to delete and no checkpoint since `activeSince`: more than one checkpoint in a namespace, or no row in
// public.threads. Writes and blobs always come with a checkpoint (put() stores the blobs in its transaction, putWrites() targets
// a stored checkpoint, deleteThread() and this cleanup remove a thread's rows together), so no thread holds them without one
export async function findPrunableThreads(pool: Pool, activeSince: Date) {
  const { rows } = await pool.query<{ thread_id: string }>(
    `SELECT thread_id
    FROM ${CHECKPOINTS}
    GROUP BY thread_id
    HAVING max((checkpoint ->> 'ts')::timestamptz) < $1
      AND (count(*) > count(DISTINCT checkpoint_ns) OR thread_id NOT IN (SELECT id::text FROM public.threads))
    ORDER BY thread_id`,
    [activeSince]
  )

  return rows.map((row) => row.thread_id)
}

// Deletes the rows of `table` matching `where`, or with `dryRun` only selects them, returning the size of each row's payload
function deleteRows(dryRun: boolean, table: string, alias: string, where: string, bytes: string) {
  return dryRun
    ? `SELECT ${bytes} AS bytes FROM ${table} ${alias} WHERE ${where}`
    : `DELETE FROM ${table} ${alias} WHERE ${where} RETURNING ${bytes} AS bytes`
}

// Prunes the given threads in a single statement, so it runs in one transaction and every part sees the same snapshot: a
// checkpoint committed while it runs is invisible to it, so neither that checkpoint nor the blobs and writes it adds are
// deleted. Threads with a checkpoint since `activeSince` are checked again here and skipped. With `dryRun` nothing is deleted
// and the counts are what would be. Safe to re-run: a pruned thread has nothing left to delete
export async function pruneThreads(pool: Pool, threadIds: string[], activeSince: Date, dryRun: boolean): Promise<CheckpointCleanupCounts> {
  const { rows } = await pool.query<Record<keyof CheckpointCleanupCounts, string>>(
    `WITH inactive AS (
      SELECT ids.thread_id
      FROM unnest($1::text[]) AS ids(thread_id)
      WHERE NOT EXISTS (
        SELECT 1 FROM ${CHECKPOINTS} c WHERE c.thread_id = ids.thread_id AND (c.checkpoint ->> 'ts')::timestamptz >= $2
      )
    ),
    -- The checkpoint getTuple() loads for each namespace. Orphaned threads keep none
    latest AS (
      SELECT DISTINCT ON (c.thread_id, c.checkpoint_ns) c.thread_id, c.checkpoint_ns, c.checkpoint_id, c.parent_checkpoint_id, c.checkpoint
      FROM ${CHECKPOINTS} c
      JOIN inactive i ON i.thread_id = c.thread_id
      JOIN public.threads t ON t.id::text = c.thread_id
      ORDER BY c.thread_id, c.checkpoint_ns, c.checkpoint_id DESC
    ),
    deleted_checkpoints AS (
      ${deleteRows(
        dryRun,
        CHECKPOINTS,
        "c",
        `c.thread_id IN (SELECT thread_id FROM inactive)
        AND NOT EXISTS (
          SELECT 1 FROM latest l
          WHERE l.thread_id = c.thread_id AND l.checkpoint_ns = c.checkpoint_ns AND l.checkpoint_id = c.checkpoint_id
        )`,
        "pg_column_size(c.checkpoint) + pg_column_size(c.metadata)"
      )}
    ),
    deleted_writes AS (
      ${deleteRows(
        dryRun,
        CHECKPOINT_WRITES,
        "w",
        `w.thread_id IN (SELECT thread_id FROM inactive)
        AND NOT EXISTS (
          SELECT 1 FROM latest l
          WHERE l.thread_id = w.thread_id AND l.checkpoint_ns = w.checkpoint_ns
            AND (
              l.checkpoint_id = w.checkpoint_id
              -- getTuple() also loads the pending sends of the parent of a checkpoint older than format v4
              OR ((l.checkpoint ->> 'v')::int < 4 AND l.parent_checkpoint_id = w.checkpoint_id AND w.channel = $3)
            )
        )`,
        "pg_column_size(w.blob)"
      )}
    ),
    deleted_blobs AS (
      ${deleteRows(
        dryRun,
        CHECKPOINT_BLOBS,
        "b",
        `b.thread_id IN (SELECT thread_id FROM inactive)
        AND NOT EXISTS (
          SELECT 1 FROM latest l, jsonb_each_text(l.checkpoint -> 'channel_versions') v
          WHERE l.thread_id = b.thread_id AND l.checkpoint_ns = b.checkpoint_ns AND v.key = b.channel AND v.value = b.version
        )`,
        "coalesce(pg_column_size(b.blob), 0)"
      )}
    )
    SELECT
      (SELECT count(*) FROM inactive) AS "threads",
      (SELECT count(*) FROM deleted_checkpoints) AS "checkpoints",
      (SELECT coalesce(sum(bytes), 0) FROM deleted_checkpoints) AS "checkpointBytes",
      (SELECT count(*) FROM deleted_writes) AS "writes",
      (SELECT coalesce(sum(bytes), 0) FROM deleted_writes) AS "writeBytes",
      (SELECT count(*) FROM deleted_blobs) AS "blobs",
      (SELECT coalesce(sum(bytes), 0) FROM deleted_blobs) AS "blobBytes"`,
    [threadIds, activeSince, TASKS]
  )

  const row = rows[0]
  return {
    threads: Number(row.threads),
    checkpoints: Number(row.checkpoints),
    checkpointBytes: Number(row.checkpointBytes),
    writes: Number(row.writes),
    writeBytes: Number(row.writeBytes),
    blobs: Number(row.blobs),
    blobBytes: Number(row.blobBytes),
  }
}
