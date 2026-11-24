import { parseArgs } from "node:util"
import { CHECKPOINTER_SCHEMA } from "@/ai/checkpointer"
import { describeStorageProblem, isMediaStorageConfigured } from "@/apollo/sources/s3Source"
import { LAST_ACTIVITY_SQL } from "@/services/conversationDeletion"
import { STALE_DELIVERY_MS } from "@/services/enquiries"
import { lumiVersion, lumiVersionState, UPDATE_CHECK_VARIABLE, type LumiVersionState } from "@/services/updateCheck"
import { crawlStartOverdue, websiteCrawlLockHeld } from "@/services/websiteCrawls"
import { capitalized } from "@/utils/text"
import { listAppliedMigrations, readMigrationJournal, type JournalEntry } from "@db/migrator"
import * as schema from "@db/schema"
import { sql } from "drizzle-orm"
import { drizzle } from "drizzle-orm/node-postgres"
import type { Pool } from "pg"

import { createCommandPool, describeError, VECTOR_MISSING } from "./commands"
import { bundledStorageProblem, describeDatabase, describeMediaStorage, usesBundledStorage } from "./config"
import { CHECKPOINTER_TABLES, MIGRATIONS_FOLDER } from "./health"

// The status command: a read-only report for operators, before an upgrade and while monitoring. The image's version and the
// latest release, the schema's migrations, and what the database holds, as counts. It never prints secrets, visitor contact
// details or message content: only the business's and the websites' names, which are public

const STATUS_USAGE = `Usage: status

Reports the image's Lumi version and whether a newer release is published, which database and media storage the
installation uses and whether they work, the database schema's migrations, whether the business is set up, and how many admin
accounts, API keys, conversations, enquiries, knowledge records, website pages and uploaded images the installation holds.
It changes nothing, except that it may write and delete a small check object in media storage when the storage's key may
not read the bucket itself, as Amazon S3 keys limited to the bucket's objects can't. To find the latest release it sends
one request to GitHub's API, with nothing about the installation, unless ${UPDATE_CHECK_VARIABLE}=off. Exits with 1 when
the database can't be reached.`

// The image's bundled migrations, oldest first
export const readJournal = () => readMigrationJournal(MIGRATIONS_FOLDER)

export interface SchemaState {
  // created_at of each applied migration, oldest first; empty when none ran
  applied: number[]
  // The latest applied migration, named from the journal when the image bundles it
  latest: { tag: string; when: number } | undefined
  // Bundled migrations newer than the latest applied, which migrate would apply
  pending: JournalEntry[]
}

// The migrator applies the bundled migrations newer than the newest recorded, so those are the pending ones (db/migrator.ts)
export async function readSchemaState(pool: Pool, journal: JournalEntry[]): Promise<SchemaState> {
  const applied = await listAppliedMigrations(pool)

  const latestWhen = applied.at(-1)
  const latest =
    latestWhen === undefined
      ? undefined
      : { when: latestWhen, tag: journal.find((entry) => entry.when === latestWhen)?.tag ?? `a migration this image doesn't have (${latestWhen})` }
  const pending = journal.filter((entry) => latestWhen === undefined || entry.when > latestWhen)
  return { applied, latest, pending }
}

const plural = (count: number, word: string, words = `${word}s`) => `${count} ${count === 1 ? word : words}`

// Runs a section of the report, which shows why it couldn't be read rather than ending the report, e.g. on a database whose
// migrations are pending
async function section(title: string, read: () => Promise<string[]>) {
  console.log(`\n${title}`)
  try {
    for (const line of await read()) console.log(`  ${line}`)
  } catch (error) {
    console.log(`  Couldn't be read: ${describeError(error)}`)
  }
}

// How the websites page tells a crawl that never started or was killed from one in progress (src/services/websiteCrawls.ts)
function crawlState(status: string, startOverdue: boolean, crawling: boolean) {
  if (status === "queued") return crawling ? "running" : startOverdue ? "never started" : "starting"
  if (status === "running") return crawling ? "running" : "interrupted"
  return status
}

const DATE_FORMAT = `'YYYY-MM-DD HH24:MI "UTC"'`

// The latest release beside the image's version, so an operator knows before upgrading what there is to upgrade to
function describeLatestRelease(state: LumiVersionState) {
  if (state.check === "OFF") return `Update check: off (${UPDATE_CHECK_VARIABLE}=off)`
  if (state.check === "UNAVAILABLE") return `Couldn't check for a newer release: ${state.reason}`

  const { version, url, publishedAt } = state.latest
  const latest = `${version}, published ${publishedAt.slice(0, 10)}`
  if (state.updateAvailable) return `A newer release is available: ${latest}. Its notes say how to upgrade: ${url}`
  if (version === state.current) return `Up to date: the latest release is ${latest}`
  // A build from a checkout (local), or one newer than the latest release
  return `The latest release is ${latest}: ${url}`
}

export async function status(args: string[]): Promise<number> {
  try {
    const { values } = parseArgs({ args, options: { help: { type: "boolean", short: "h" } } })
    if (values.help) {
      console.log(STATUS_USAGE)
      return 0
    }
  } catch (error) {
    console.error(`${(error as Error).message}\n\n${STATUS_USAGE}`)
    return 2
  }

  // Asked first and shown after the schema, so GitHub's answer arrives while the database, storage and schema are checked. It
  // never fails: the report says why it couldn't check, so the service doesn't log it too
  const versionState = lumiVersionState({ logFailure: false })

  // Every query is bounded, so a report never hangs on a stuck database
  const pool = createCommandPool("lumi-status", { statementTimeoutMs: 60_000 })

  try {
    try {
      await pool.query("select 1")
    } catch (error) {
      console.error(`The ${describeDatabase()} can't be reached: ${describeError(error)}`)
      return 1
    }

    console.log(`\nLumi ${lumiVersion()}`)

    await section("Database", async () => {
      const { rows } = await pool.query<{ version: string; installed: string | null; available: string | null }>(
        `select
          current_setting('server_version') as version,
          (select extversion from pg_extension where extname = 'vector') as installed,
          (select default_version from pg_available_extensions where name = 'vector') as available`
      )
      const { version, installed, available } = rows[0]
      return [
        `${capitalized(describeDatabase())}, PostgreSQL ${version}`,
        installed
          ? `pgvector ${installed}`
          : available
            ? `pgvector ${available} is available and not installed yet: migrate installs it`
            : VECTOR_MISSING,
      ]
    })

    await section("Media storage", async () => {
      const bundled = usesBundledStorage()
      if (!isMediaStorageConfigured()) {
        return bundled
          ? ["Bundled storage", `Not working: ${bundledStorageProblem() ?? "its settings weren't applied"}`]
          : ["Off: images can't be uploaded. Set S3_UPLOADS_BUCKET_NAME and the other S3_* settings to turn it on"]
      }
      const problem = await describeStorageProblem({ bundled })
      return [capitalized(describeMediaStorage()), problem ? `Not working: ${problem}` : "Working: it answers, and accepts the installation's key"]
    })

    const journal = readJournal()
    let ready = false
    await section("Schema", async () => {
      const schemaState = await readSchemaState(pool, journal)
      const { rows } = await pool.query<{ tables: number }>(
        "select count(*)::int as tables from pg_tables where schemaname = $1 and tablename = any($2::text[])",
        [CHECKPOINTER_SCHEMA, CHECKPOINTER_TABLES]
      )
      const checkpointerReady = rows[0].tables === CHECKPOINTER_TABLES.length
      ready = schemaState.applied.length > 0

      return [
        schemaState.latest
          ? `${plural(schemaState.applied.length, "migration")} applied, the latest ${schemaState.latest.tag}`
          : "No migrations applied: the database is empty. Run migrate",
        schemaState.pending.length === 0
          ? "Up to date with this image"
          : `${plural(schemaState.pending.length, "pending migration")}, applied by migrate: ${schemaState.pending.map((entry) => entry.tag).join(", ")}`,
        `Checkpointer tables (conversation messages): ${checkpointerReady ? "ready" : "missing. Run migrate"}`,
      ]
    })

    await section("Releases", async () => [describeLatestRelease(await versionState)])
    if (!ready) return 0

    await section("Business", async () => {
      const { rows } = await pool.query<{ business_name: string }>("select business_name from business_settings limit 1")
      return [rows[0] ? `Set up as ${rows[0].business_name}` : "Not set up: the onboarding wizard runs at the public address"]
    })

    await section("Access", async () => {
      const { rows } = await pool.query<{ admins: number; api_keys: number }>(
        `select
          (select count(*)::int from admin_accounts) as admins,
          (select count(*)::int from api_keys where revoked_at is null) as api_keys`
      )
      return [
        `${plural(rows[0].admins, "admin account")} (Lumi sign-in; Google Workspace admins have none)`,
        `${plural(rows[0].api_keys, "active API key")}`,
      ]
    })

    await section("Conversations (visitor data)", async () => {
      const { rows } = await pool.query<{
        conversations: number
        oldest_activity: string | null
        enquiries: number
        failed_deliveries: number
        failed_enquiries: number
      }>(
        `with failed as (
          -- As the admin reads them: failed, or pending for so long that the sending was interrupted
          select enquiry_id from enquiry_deliveries
          where status = 'failed' or (status = 'pending' and updated_at < (now() at time zone 'UTC') - make_interval(secs => $1))
        )
        select
          (select count(*)::int from threads) as conversations,
          (select to_char(min(${LAST_ACTIVITY_SQL}), ${DATE_FORMAT}) from threads t) as oldest_activity,
          (select count(*)::int from enquiries) as enquiries,
          (select count(*)::int from failed) as failed_deliveries,
          (select count(distinct enquiry_id)::int from failed) as failed_enquiries`,
        [STALE_DELIVERY_MS / 1000]
      )
      const counts = rows[0]
      return [
        `${plural(counts.conversations, "conversation")}${counts.oldest_activity ? `, the longest inactive last active ${counts.oldest_activity}` : ""}`,
        plural(counts.enquiries, "enquiry", "enquiries"),
        counts.failed_deliveries === 0
          ? "No failed enquiry deliveries"
          : `${plural(counts.failed_deliveries, "failed enquiry delivery", "failed enquiry deliveries")} in ${plural(counts.failed_enquiries, "enquiry", "enquiries")}: retry them from the admin's conversations`,
      ]
    })

    await section("Knowledge records", async () => {
      const { rows } = await pool.query<{ source: string; total: number; published: number | null }>(
        `select 'Team members' as source, count(*)::int as total, count(*) filter (where published)::int as published from team_members
        union all select 'Projects', count(*)::int, count(*) filter (where published)::int from projects
        union all select 'Clients', count(*)::int, count(*) filter (where published)::int from clients
        union all select 'Capabilities', count(*)::int, null from capabilities
        union all select 'Job openings', count(*)::int, count(*) filter (where published)::int from job_openings
        union all select 'Company profile', count(*)::int, null from company`
      )
      return rows.map((row) => `${row.source}: ${row.total}${row.published === null ? "" : ` (${row.published} published)`}`)
    })

    await section("Websites", async () => {
      // Through Drizzle for the crawl lock and start checks the websites page uses
      const db = drizzle(pool, { schema })
      const { rows } = await db.execute<{
        name: string
        url: string
        pages: number
        vectors: number
        last_processed: string | null
        crawl_status: string | null
        crawl_requested: string | null
        start_overdue: boolean | null
        crawling: boolean
      }>(sql`
        select
          websites.name,
          websites.url,
          (select count(*)::int from website_pages p where p.website_id = websites.id) as pages,
          (select count(*)::int from website_page_vectors v join website_pages p on p.id = v.webpage_id where p.website_id = websites.id) as vectors,
          to_char(websites.last_processed, ${sql.raw(DATE_FORMAT)}) as last_processed,
          crawl.status as crawl_status,
          to_char(crawl.created_at, ${sql.raw(DATE_FORMAT)}) as crawl_requested,
          ${crawlStartOverdue(sql`crawl.created_at`)} as start_overdue,
          ${websiteCrawlLockHeld(schema.websites.id)} as crawling
        from websites
        left join lateral (
          select c.status, c.created_at from website_crawls c where c.website_id = websites.id order by c.created_at desc limit 1
        ) crawl on true
        order by websites.name`)
      if (rows.length === 0) return ["None"]
      return rows.flatMap((website) => [
        `${website.name} (${website.url}): ${plural(website.pages, "page")}, ${plural(website.vectors, "search chunk")}`,
        `  ${
          website.crawl_status
            ? `Latest crawl: ${crawlState(website.crawl_status, website.start_overdue === true, website.crawling)}, requested ${website.crawl_requested}`
            : website.pages > 0
              ? // Pages kept from before crawls were recorded
                "No crawl recorded"
              : "Never crawled: choose Update pages in Knowledge → Websites"
        }${website.last_processed ? `. Last completed ${website.last_processed}` : ""}`,
      ])
    })

    await section("Media", async () => {
      const { rows } = await pool.query<{ uploads: number }>("select count(*)::int as uploads from uploads")
      return [`${plural(rows[0].uploads, "uploaded image")} recorded (the files are in media storage: ${describeMediaStorage()})`]
    })

    return 0
  } finally {
    await pool.end().catch(() => undefined)
  }
}
