import { CHECKPOINTER_SCHEMA } from "@/ai/checkpointer"
import type { Pool } from "pg"

import { withTransaction } from "./db"

// Deletion of visitor conversations, used by the admin's delete (dbDataSource.deleteThread), the container's
// delete-conversations command and the worker's conversation retention. A conversation is a public.threads row and its
// LangGraph checkpoints, which hold the messages. Its enquiries, their deliveries and its usage records go with the thread
// through their foreign keys' cascade; no foreign key reaches the checkpoints in the langgraph schema, so they are deleted
// explicitly, in the same transaction, so a conversation is never left half deleted.
//
// The checkpoint deletes and the last activity read raw SQL on @langchain/langgraph-checkpoint-postgres's tables, matching its
// deleteThread() and the checkpoint's `ts`: check them whenever the lockfile moves it to a new version, as for
// src/ai/checkpointCleanup.ts.
//
// A chat still running on a thread while it is deleted may write a checkpoint after the deletion commits. That checkpoint
// belongs to no thread, and the weekly checkpoint cleanup deletes it with the other orphaned ones

const CHECKPOINTS = `"${CHECKPOINTER_SCHEMA}".checkpoints`
const CHECKPOINT_TABLES = [`"${CHECKPOINTER_SCHEMA}".checkpoint_writes`, `"${CHECKPOINTER_SCHEMA}".checkpoint_blobs`, CHECKPOINTS]

// Conversations deleted per transaction
const BATCH_SIZE = 100

// The most statements a batch of deleteMatchingConversations runs, each bounded by the pool's query timeout: the page of ids,
// begin, the lock, the selection's check, the counts, the three checkpoint deletes, the threads delete and commit. A caller
// with a time budget keeps this many query timeouts in reserve, so a batch cut off by them still ends within it
export const MAX_STATEMENTS_PER_BATCH = 10

// Which conversations to delete: those matching every criterion given. At least one is required, so an empty selection
// can never match every conversation
export interface ConversationSelection {
  // Any of these thread ids
  threadIds?: string[]
  // The thread's email, or the contact email of any of its enquiries, compared case-insensitively once trimmed
  email?: string
  // Conversations whose last activity is earlier than this
  lastActivityBefore?: Date
}

export interface ConversationSummary {
  id: string
  startedAt: Date
  lastActivityAt: Date
  enquiries: number
}

export interface ConversationDeletionCounts {
  conversations: number
  enquiries: number
  enquiryDeliveries: number
  usageRecords: number
  checkpoints: number
  checkpointBlobs: number
  checkpointWrites: number
}

const emptyDeletionCounts = (): ConversationDeletionCounts => ({
  conversations: 0,
  enquiries: 0,
  enquiryDeliveries: 0,
  usageRecords: 0,
  checkpoints: 0,
  checkpointBlobs: 0,
  checkpointWrites: 0,
})

function addDeletionCounts(total: ConversationDeletionCounts, counts: ConversationDeletionCounts) {
  for (const key of Object.keys(total) as (keyof ConversationDeletionCounts)[]) total[key] += counts[key]
}

// A conversation's last activity: when it started, when a turn, booking or enquiry last started (last_activity_at, stamped
// before anything else is saved, as a turn only saves its checkpoint once it ends), its latest checkpoint (with the time in
// `ts`, for the messages saved before last_activity_at existed) or its latest enquiry, whichever is latest, in UTC without a
// time zone like the threads' times. `t` is the thread. The subqueries use the checkpoints' primary key and the enquiries'
// thread index, both led by the thread id
export const LAST_ACTIVITY_SQL = `greatest(
  t.created_at,
  t.last_activity_at,
  (select max((c.checkpoint ->> 'ts')::timestamptz) at time zone 'UTC' from ${CHECKPOINTS} c where c.thread_id = t.id::text),
  (select max(e.created_at) from public.enquiries e where e.thread_id = t.id)
)`

const normalizeEmail = (email: string) => email.trim().toLowerCase()

// The selection's criteria as SQL conditions on the thread `t`, with their parameters appended to `values`
function selectionConditions(selection: ConversationSelection, values: unknown[]): string[] {
  const param = (value: unknown) => {
    values.push(value)
    return `$${values.length}`
  }

  const conditions: string[] = []
  if (selection.threadIds !== undefined) conditions.push(`t.id = any(${param(selection.threadIds)}::uuid[])`)
  if (selection.email !== undefined) {
    const email = param(normalizeEmail(selection.email))
    conditions.push(`(
      lower(trim(t.email)) = ${email}
      or exists (select 1 from public.enquiries e where e.thread_id = t.id and lower(trim(e.contact ->> 'email')) = ${email})
    )`)
  }
  // Thread times are UTC without a time zone
  if (selection.lastActivityBefore !== undefined) {
    conditions.push(`${LAST_ACTIVITY_SQL} < (${param(selection.lastActivityBefore.toISOString())}::timestamptz at time zone 'UTC')`)
  }
  return conditions
}

// The selection's conditions, refusing an empty selection, which would match every conversation
function requiredConditions(selection: ConversationSelection, values: unknown[]) {
  const conditions = selectionConditions(selection, values)
  if (conditions.length === 0) throw new Error("Select the conversations to delete by thread, email or last activity")
  return conditions
}

// How many conversations the selection matches, and the first `limit` of them, those inactive longest first, for the
// delete-conversations report. Bounded however many match
export async function previewConversations(
  pool: Pool,
  selection: ConversationSelection,
  limit: number
): Promise<{ total: number; conversations: ConversationSummary[] }> {
  const countValues: unknown[] = []
  const countConditions = requiredConditions(selection, countValues)
  const { rows: counted } = await pool.query<{ total: number }>(
    `select count(*)::int as total from public.threads t where ${countConditions.join(" and ")}`,
    countValues
  )

  const values: unknown[] = []
  const conditions = requiredConditions(selection, values)
  const { rows } = await pool.query<{ id: string; started_at: Date; last_activity_at: Date; enquiries: number }>(
    `select id, started_at, last_activity_at, enquiries from (
      select
        t.id,
        t.created_at at time zone 'UTC' as started_at,
        ${LAST_ACTIVITY_SQL} at time zone 'UTC' as last_activity_at,
        (select count(*)::int from public.enquiries e where e.thread_id = t.id) as enquiries
      from public.threads t
      where ${conditions.join(" and ")}
    ) matched
    order by last_activity_at, id
    limit ${Number(limit)}`,
    values
  )
  return {
    total: counted[0].total,
    conversations: rows.map((row) => ({ id: row.id, startedAt: row.started_at, lastActivityAt: row.last_activity_at, enquiries: row.enquiries })),
  }
}

// Deletes these conversations in one transaction: their checkpoints and their threads, with the enquiries, deliveries and
// usage records that cascade. The threads are locked first, in id order, so nothing can be added to them while they are
// checked, counted and deleted, and a turn, booking or enquiry starting meanwhile waits to stamp the thread active
// (markThreadActive in dbDataSource), then finds it gone. With criteria in `selection`, only those still matching it are deleted, checked once they are
// locked so a conversation that became active again since it was selected is kept. By id alone (the admin's delete), the
// ids' checkpoints are deleted even without a thread, as LangGraph's deleteThread() does. Ids with nothing left are skipped,
// which makes a rerun safe
export async function deleteConversationBatch(
  pool: Pool,
  threadIds: string[],
  selection: ConversationSelection = {}
): Promise<ConversationDeletionCounts> {
  if (threadIds.length === 0) return emptyDeletionCounts()

  return withTransaction(pool, async (client) => {
    const locked = await client.query<{ id: string }>("select id from public.threads where id = any($1::uuid[]) order by id for update", [threadIds])
    let ids = locked.rows.map((row) => row.id)

    // A statement of its own: under read committed, a statement that waited for a lock still reads the other tables as they
    // were when it started, so activity committed while it waited would go unseen
    const values: unknown[] = [ids]
    const conditions = selectionConditions(selection, values)
    const byIdAlone = conditions.length === 0
    if (!byIdAlone && ids.length > 0) {
      const matching = await client.query<{ id: string }>(
        `select t.id from public.threads t where t.id = any($1::uuid[]) and ${conditions.join(" and ")}`,
        values
      )
      ids = matching.rows.map((row) => row.id)
    }

    // LangGraph keys its rows by the thread id as text, as the threads' uuids print
    const checkpointIds = byIdAlone ? [...new Set(threadIds.map((id) => id.trim().toLowerCase()))] : ids
    if (checkpointIds.length === 0) return emptyDeletionCounts()

    const { rows } = await client.query<{ enquiries: number; deliveries: number; usage: number }>(
      `select
        (select count(*)::int from public.enquiries where thread_id = any($1::uuid[])) as enquiries,
        (select count(*)::int from public.enquiry_deliveries d join public.enquiries e on e.id = d.enquiry_id
          where e.thread_id = any($1::uuid[])) as deliveries,
        (select count(*)::int from public.thread_usage where thread_id = any($1::uuid[])) as usage`,
      [ids]
    )

    // One at a time: a transaction holds a single connection
    const deleted: number[] = []
    for (const table of CHECKPOINT_TABLES) {
      const result = await client.query(`delete from ${table} where thread_id = any($1::text[])`, [checkpointIds])
      deleted.push(result.rowCount ?? 0)
    }
    const [writes, blobs, checkpoints] = deleted
    const threads = await client.query("delete from public.threads where id = any($1::uuid[])", [ids])

    return {
      conversations: threads.rowCount ?? 0,
      enquiries: rows[0].enquiries,
      enquiryDeliveries: rows[0].deliveries,
      usageRecords: rows[0].usage,
      checkpoints,
      checkpointBlobs: blobs,
      checkpointWrites: writes,
    }
  })
}

export interface DeletionRun {
  counts: ConversationDeletionCounts
  // Whether every matching conversation was deleted, rather than the run stopping for its time budget
  complete: boolean
}

// Deletes every conversation the selection matches, a page of ids at a time in id order, one transaction per page, so no
// statement reads more than a page, memory holds no more, and the run always moves forward. Whatever was deleted stays deleted
// when a later page fails. With a time budget, stops before a page when less than `reserveMs` of it is left; the next run
// continues with the rest
export async function deleteMatchingConversations(
  pool: Pool,
  selection: ConversationSelection,
  { remainingTimeMs = () => Infinity, reserveMs = 0 }: { remainingTimeMs?: () => number; reserveMs?: number } = {}
): Promise<DeletionRun> {
  const counts = emptyDeletionCounts()
  let after = "00000000-0000-0000-0000-000000000000"

  for (;;) {
    if (remainingTimeMs() < reserveMs) return { counts, complete: false }

    const values: unknown[] = [after, BATCH_SIZE]
    const conditions = requiredConditions(selection, values)
    const { rows } = await pool.query<{ id: string }>(
      `select t.id from public.threads t where t.id > $1::uuid and ${conditions.join(" and ")} order by t.id limit $2`,
      values
    )
    if (rows.length === 0) return { counts, complete: true }

    const ids = rows.map((row) => row.id)
    addDeletionCounts(counts, await deleteConversationBatch(pool, ids, selection))
    after = ids[ids.length - 1]
  }
}

// The counts as log lines, for the command and the worker
export function describeDeletionCounts(counts: ConversationDeletionCounts): string[] {
  return [
    `Deleted ${counts.conversations} conversation(s), with:`,
    `- enquiries: ${counts.enquiries}`,
    `- enquiry deliveries: ${counts.enquiryDeliveries}`,
    `- usage records: ${counts.usageRecords}`,
    `- checkpoints: ${counts.checkpoints}, checkpoint blobs: ${counts.checkpointBlobs}, checkpoint writes: ${counts.checkpointWrites}`,
  ]
}
