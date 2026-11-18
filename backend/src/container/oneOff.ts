import { parseArgs } from "node:util"
import { runAdminReset } from "@/scripts/adminResetCommand"
import {
  deleteMatchingConversations,
  describeDeletionCounts,
  previewConversations,
  type ConversationSelection,
} from "@/services/conversationDeletion"
import { cleanUpCheckpoints } from "@/tasks/checkpointCleanup/lambda/entry"
import { envPoolConfig } from "@/utils/db-setup"
import { describeAppliedMigrations, migrateCheckpointer, migrateSchema, MIGRATION_POOL_OPTIONS, SpendBackfillError } from "@db/migrator"
import { Pool } from "pg"

import { createCommandPool, describeError, UUID_PATTERN, VECTOR_MISSING } from "./commands"
import { CHECKPOINT_CLEANUP_TIME_BUDGET_MS } from "./config"
import { MIGRATIONS_FOLDER } from "./health"

// The container's one-off commands: each connects with the DB_* variables, does its work and resolves to the exit code

// Applies the bundled Drizzle migrations, then the LangGraph checkpointer migration (db/migrator.ts). Both only apply what is
// pending, so running it again changes nothing; the schema migrations of a run that fails are all rolled back
export async function migrate(): Promise<number> {
  // Two connections: one holds the migration lock while the other migrates
  const pool = new Pool({ ...envPoolConfig("lumi-migrate"), ...MIGRATION_POOL_OPTIONS, max: 2, connectionTimeoutMillis: 10_000 })
  pool.on("error", (error) => console.warn("A database connection failed:", error.message))

  let step = "the schema migrations"
  let vectorInstalled = true
  try {
    // The first migration installs pgvector. An external database may not offer it, or not let Lumi's user install it
    const { rows } = await pool.query<{ installed: boolean; available: boolean }>(
      `select
        exists (select from pg_extension where extname = 'vector') as installed,
        exists (select from pg_available_extensions where name = 'vector') as available`
    )
    if (!rows[0].installed && !rows[0].available) {
      console.error(`Can't migrate: ${VECTOR_MISSING}.`)
      return 1
    }
    vectorInstalled = rows[0].installed

    console.log(`Applying the schema migrations in ${MIGRATIONS_FOLDER}`)
    console.log(`Schema: ${describeAppliedMigrations(await migrateSchema(pool, MIGRATIONS_FOLDER))}`)

    step = "the checkpointer migration"
    await migrateCheckpointer(pool)
    console.log("Checkpointer: up to date")
    return 0
  } catch (error) {
    // Its message already says which migrations were applied, why the backfill failed and what to do
    if (error instanceof SpendBackfillError) {
      console.error(`Migration failed during the daily spending backfill: ${error.message}`)
      return 1
    }
    console.error(`Migration failed during ${step}: ${describeError(error)}`)
    if (!vectorInstalled && /extension/i.test((error as Error).message ?? "")) {
      console.error(
        `The database user ${process.env.DB_USER} may not install pgvector: have an administrator run CREATE EXTENSION vector; in the ${process.env.DB_NAME} database.`
      )
    }
    console.error(
      step === "the schema migrations"
        ? "No schema migration of this run was kept. Fix the problem and run migrate again."
        : "The schema migrations were applied. Fix the problem and run migrate again to finish."
    )
    return 1
  } finally {
    await pool.end().catch(() => undefined)
  }
}

const ADMIN_RESET_USAGE = `Usage: admin-reset <email> [--name "Name"]

Creates the admin account with this email, or resets its password, to a temporary password printed once. Connects with the
DB_* variables; the database must be migrated.`

export function adminReset(args: string[]): Promise<number> {
  return runAdminReset({
    args,
    usage: ADMIN_RESET_USAGE,
    envOption: false,
    connect: async () => {
      const pool = new Pool({ ...envPoolConfig("lumi-admin-reset"), max: 1, connectionTimeoutMillis: 10_000 })
      pool.on("error", (error) => console.warn("A database connection failed:", error.message))
      return pool
    },
  })
}

const CLEANUP_USAGE = `Usage: checkpoint-cleanup [--apply]

Reports the checkpoint data chats no longer need, which the worker deletes weekly. With --apply it deletes it.`

export async function checkpointCleanup(args: string[]): Promise<number> {
  let apply: boolean
  try {
    const { values } = parseArgs({ args, options: { apply: { type: "boolean" }, help: { type: "boolean", short: "h" } } })
    if (values.help) {
      console.log(CLEANUP_USAGE)
      return 0
    }
    apply = values.apply === true
  } catch (error) {
    console.error(`${(error as Error).message}\n\n${CLEANUP_USAGE}`)
    return 2
  }

  const deadline = Date.now() + CHECKPOINT_CLEANUP_TIME_BUDGET_MS
  try {
    const result = await cleanUpCheckpoints({ dryRun: !apply }, () => deadline - Date.now())
    if (!result.complete) console.log("Not every thread was processed: run it again to continue.")
    if (!apply) console.log("Dry run: nothing was deleted. Run with --apply to delete.")
    return 0
  } catch (error) {
    console.error(`Checkpoint cleanup failed: ${describeError(error)}`)
    return 1
  }
}

const DELETE_CONVERSATIONS_USAGE = `Usage: delete-conversations [--thread <id>]... [--email <address>] [--older-than <days> | --before <YYYY-MM-DD>] [--apply]

Reports the visitor conversations matching every criterion given, and with --apply deletes them: their messages
(checkpoints), enquiries, enquiry deliveries and usage records. At least one criterion is required.

  --thread <id>          The conversation with this id, the end of its page's address in the admin
                         (/admin/conversations/<id>). Repeat it for several
  --email <address>      Conversations with this email, given in the chat or in any of their enquiries (any case)
  --older-than <days>    Conversations with no activity for at least this many days
  --before <YYYY-MM-DD>  Conversations with no activity since before this day (UTC)
  --apply                Delete them. Without it nothing is deleted

Deleted conversations can't be recovered from Lumi, but stay in any backup of the database until it expires.`

// Conversations listed in the report, which gives no contact details or content
const LISTED_CONVERSATIONS = 50
const UUID = new RegExp(`^${UUID_PATTERN}$`, "i")
const DATE = /^(\d{4})-(\d{2})-(\d{2})$/

// The selection the arguments give, or throws a message for the operator
function parseConversationSelection(values: { thread?: string[]; email?: string; "older-than"?: string; before?: string }): ConversationSelection {
  const selection: ConversationSelection = {}

  if (values.thread) {
    const invalid = values.thread.filter((id) => !UUID.test(id.trim()))
    if (invalid.length) throw new Error(`Not a conversation id: ${invalid.join(", ")}. Ids look like 3f2b6c1e-8d4a-4b7e-9c2d-5a6e7f8091ab.`)
    selection.threadIds = values.thread.map((id) => id.trim().toLowerCase())
  }

  if (values.email !== undefined) {
    if (!values.email.trim().includes("@")) throw new Error(`Not an email address: ${values.email}`)
    selection.email = values.email
  }

  if (values["older-than"] !== undefined && values.before !== undefined) throw new Error("Give --older-than or --before, not both.")
  if (values["older-than"] !== undefined) {
    const days = values["older-than"].trim()
    if (!/^\d+$/.test(days) || Number(days) < 1) throw new Error("--older-than takes a whole number of days of at least 1.")
    selection.lastActivityBefore = new Date(Date.now() - Number(days) * 24 * 60 * 60 * 1000)
  }
  if (values.before !== undefined) {
    const match = DATE.exec(values.before.trim())
    const day = match && new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])))
    if (!day || day.toISOString().slice(0, 10) !== values.before.trim()) throw new Error("--before takes a date as YYYY-MM-DD, e.g. 2025-01-31.")
    selection.lastActivityBefore = day
  }

  if (!selection.threadIds && selection.email === undefined && !selection.lastActivityBefore) {
    throw new Error("Select the conversations with --thread, --email, --older-than or --before.")
  }
  return selection
}

const day = (date: Date) => date.toISOString().slice(0, 10)

// Visitor data deletion: reports how many conversations the criteria match and lists the first of them, by id, dates and
// number of enquiries only, and with --apply deletes every match a page at a time, one transaction each
// (src/services/conversationDeletion.ts), so it holds no more than a page however many match. A rerun is safe: what was
// deleted no longer matches
export async function deleteConversations(args: string[]): Promise<number> {
  let selection: ConversationSelection
  let apply: boolean
  try {
    const { values } = parseArgs({
      args,
      options: {
        thread: { type: "string", multiple: true },
        email: { type: "string" },
        "older-than": { type: "string" },
        before: { type: "string" },
        apply: { type: "boolean" },
        help: { type: "boolean", short: "h" },
      },
    })
    if (values.help) {
      console.log(DELETE_CONVERSATIONS_USAGE)
      return 0
    }
    selection = parseConversationSelection(values)
    apply = values.apply === true
  } catch (error) {
    console.error(`${(error as Error).message}\n\n${DELETE_CONVERSATIONS_USAGE}`)
    return 2
  }

  const pool = createCommandPool("lumi-delete-conversations")

  try {
    const { total, conversations } = await previewConversations(pool, selection, LISTED_CONVERSATIONS)
    console.log(`${total} conversation(s) match.`)
    for (const conversation of conversations) {
      console.log(
        `  ${conversation.id}  started ${day(conversation.startedAt)}  last activity ${day(conversation.lastActivityAt)}  enquiries ${conversation.enquiries}`
      )
    }
    if (total > conversations.length) console.log(`  … and ${total - conversations.length} more`)
    if (selection.threadIds) {
      const missing = new Set(selection.threadIds).size - total
      if (missing > 0) console.log(`${missing} of the given ids match no conversation (or not the other criteria).`)
    }

    if (!apply) {
      if (total > 0) console.log("Dry run: nothing was deleted. Run it again with --apply to delete them.")
      return 0
    }
    if (total === 0) return 0

    const { counts } = await deleteMatchingConversations(pool, selection)
    for (const line of describeDeletionCounts(counts)) console.log(line)
    if (counts.conversations < total) {
      console.log(`${total - counts.conversations} conversation(s) no longer matched when deleted (e.g. active again), and were kept.`)
    }
    return 0
  } catch (error) {
    console.error(`Deleting conversations failed: ${describeError(error)}`)
    if (apply) console.error("The conversations deleted before the failure stay deleted, each batch completely. Run it again to continue.")
    return 1
  } finally {
    await pool.end().catch(() => undefined)
  }
}
