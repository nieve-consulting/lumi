import { parseArgs } from "node:util"
import S3Source, { isAccessDenied, isMediaStorageConfigured } from "@/apollo/sources/s3Source"
import { channelAvailability } from "@/handoff/delivery"
import { withTransaction } from "@/services/db"
import { lumiVersion } from "@/services/updateCheck"
import type { JournalEntry } from "@db/migrator"
import * as schema from "@db/schema"
import { HandoffSettingsError, parseHandoffSettings, type DeliveryChannelConfig } from "@lumi/shared-contracts/handoff"
import { is } from "drizzle-orm"
import { getTableConfig, PgTable } from "drizzle-orm/pg-core"
import type { PoolClient } from "pg"
import { z } from "zod"

import { createCommandPool, describeError, UUID_PATTERN } from "./commands"
import { readJournal, readSchemaState, type SchemaState } from "./status"

// The export and import commands, which move a business's setup between installations of the same Lumi version: its
// settings, knowledge records and uploaded images, in one JSON document (the lumi-export format, version 1):
//
//   { format: "lumi-export", formatVersion: 1, exportedAt, lumiVersion, schema: { migration, when }, includesSecrets,
//     tables: { <table>: [{ <column>: value }] }, media: [{ key, contentType, data (base64) }] }
//
// Rows are keyed by database column names, with timestamps as ISO strings in UTC, to the microsecond, and jsonb and array
// columns as JSON. `schema` is the latest migration applied to the exporting database: an import only goes into a database
// at exactly that migration, so rows never need transforming between schema versions. To move to a newer Lumi, import into
// an installation of the exporting version, then upgrade it.
//
// Exported: the business configuration and knowledge in EXPORTED_TABLES, every row, unpublished records and draft
// translations included, and the images they reference. Not exported (NOT_EXPORTED): visitor data, credentials and
// security state, usage records, and the website pages and their search index, which updating each website's pages rebuilds
// after an import (the vectors are tied to the embedding model, and large). Webhook signing secrets are left out unless
// --include-secrets is given.
//
// Export writes the document to stdout and everything else to stderr (main.ts sends console.log there for it), so
// `docker compose run --rm -T api export > lumi-export.json` gives a clean file. Import reads it from stdin

const FORMAT = "lumi-export"
const FORMAT_VERSION = 1

// In the order import inserts them: every table after those its foreign keys reference
const EXPORTED_TABLES: PgTable[] = [
  schema.businessSettings,
  schema.handoffSettings,
  schema.resumeSettings,
  schema.knowledgeSettings,
  schema.appointment_settings,
  schema.uploads,
  schema.company,
  schema.companyTranslations,
  schema.capabilities,
  schema.capabilityTranslations,
  schema.clients,
  schema.clientTranslations,
  schema.teamMembers,
  schema.teamMemberTranslations,
  schema.experience,
  schema.experienceTranslations,
  schema.teamMemberCapabilities,
  schema.projects,
  schema.projectTranslations,
  schema.projectCapabilities,
  schema.projectTeamMembers,
  schema.projectTeamMemberTranslations,
  schema.jobOpenings,
  schema.jobOpeningTranslations,
  schema.websites,
]

// Every other table, and why. A table in neither list is reported by export, so a new table is classified rather than
// silently left out
const NOT_EXPORTED: Record<string, string> = {
  threads: "visitor data",
  enquiries: "visitor data",
  enquiry_deliveries: "visitor data",
  thread_usage: "visitor data",
  admin_accounts: "credentials",
  admin_sign_in_failures: "security state",
  api_keys: "credentials",
  oauth_clients: "credentials",
  oauth_authorization_codes: "credentials",
  oauth_refresh_tokens: "credentials",
  mcp_idempotency_keys: "MCP state",
  mcp_audit_events: "MCP audit trail",
  mcp_rate_limits: "security state",
  admin_usage: "usage records",
  daily_conversation_spend: "installation spending limits",
  website_pages: "rebuilt by Update Pages",
  website_page_vectors: "rebuilt by Update Pages",
  website_crawls: "rebuilt by Update Pages",
}

const NOT_EXPORTED_SUMMARY = [
  "conversations, enquiries and their deliveries, usage records and chat checkpoints (visitor data)",
  "admin accounts, API keys, sign-in throttling and MCP connections (credentials and security state)",
  "the admin's AI usage records and the installation's daily conversation spending totals",
  "website pages and their search index: update each website's pages after importing",
]

// An image the web app serves from media storage, as settings such as the resume logo reference it
const MEDIA_PATH = new RegExp(`/media/(${UUID_PATTERN})`, "gi")

// Rows per insert statement
const INSERT_BATCH_SIZE = 500

const quote = (identifier: string) => `"${identifier.replace(/"/g, '""')}"`

interface TableInfo {
  name: string
  // The columns written, without generated ones, and whether each is a timestamp without time zone (all of Lumi's are)
  columns: { name: string; timestamp: boolean }[]
  primaryKey: string[]
  // Columns referencing uploads.key
  uploadKeys: string[]
}

function tableInfo(table: PgTable): TableInfo {
  const config = getTableConfig(table)
  const columns = config.columns
    .filter((column) => !column.generated && !column.generatedIdentity)
    .map((column) => {
      const type = column.getSQLType()
      return { name: column.name, timestamp: type.startsWith("timestamp") && !type.includes("with time zone") }
    })
  const primaryKey =
    config.primaryKeys[0]?.columns.map((column) => column.name) ?? config.columns.filter((column) => column.primary).map((column) => column.name)
  const uploadKeys = config.foreignKeys
    .map((foreignKey) => foreignKey.reference())
    .filter((reference) => reference.foreignTable === schema.uploads)
    .flatMap((reference) => reference.columns.map((column) => column.name))
  return { name: config.name, columns, primaryKey, uploadKeys }
}

const TABLES = EXPORTED_TABLES.map(tableInfo)
const TABLE_NAMES = new Set(TABLES.map((table) => table.name))

// Tables of the schema neither exported nor listed in NOT_EXPORTED
function unclassifiedTables() {
  return Object.values(schema as Record<string, unknown>)
    .filter((value): value is PgTable => is(value, PgTable))
    .map((table) => getTableConfig(table).name)
    .filter((name) => !TABLE_NAMES.has(name) && !(name in NOT_EXPORTED))
}

type Row = Record<string, unknown>

interface ExportMedia {
  key: string
  contentType: string
  data: string
}

// Everything but the media, which import reads one image at a time
const exportHeaderSchema = z.object({
  format: z.literal(FORMAT),
  formatVersion: z.literal(FORMAT_VERSION),
  exportedAt: z.string(),
  lumiVersion: z.string(),
  schema: z.object({ migration: z.string(), when: z.number() }),
  includesSecrets: z.boolean(),
  tables: z.record(z.string(), z.array(z.record(z.string(), z.unknown()))),
})

const exportMediaSchema = z.object({
  key: z.string().regex(new RegExp(`^${UUID_PATTERN}$`, "i"), "Not an upload key"),
  contentType: z.string().min(1).max(256),
  data: z.string().regex(/^[A-Za-z0-9+/]*={0,2}$/, "Not base64"),
})

type ExportFile = z.infer<typeof exportHeaderSchema> & { media: { key: string; contentType: string; body: Buffer }[] }

const megabytes = (bytes: number) => `${(bytes / 1024 / 1024).toFixed(1)} MB`

// Statements are bounded generously: an export or import reads or writes every row of a table in a few statements
const createPool = (applicationName: string) => createCommandPool(applicationName, { statementTimeoutMs: 5 * 60_000 })

// The schema an export is taken at or an import goes into: fully migrated with this image's migrations. Returns the problem
// for the operator, or the latest applied migration
function schemaProblem(state: SchemaState, journal: JournalEntry[], action: "export" | "import") {
  const bundled = journal.at(-1)
  if (!state.latest) return { problem: "No migrations have been applied to this database. Run migrate first." }
  if (!bundled || !journal.some((entry) => entry.when === state.latest?.when)) {
    return {
      problem: `The database was migrated by a newer Lumi than this image (${lumiVersion()}), to ${state.latest.tag}. ${
        action === "export" ? "Run export with that version's image." : "Import into a new database, migrated by this image."
      }`,
    }
  }
  if (state.pending.length > 0) {
    return {
      problem: `The database is at ${state.latest.tag}, but this image (Lumi ${lumiVersion()}) has ${state.pending.length} pending migration(s) up to ${bundled.tag}. Run migrate first, then ${action} again.`,
    }
  }
  return { latest: state.latest }
}

// --- Export ------------------------------------------------------------------------------------------------------------------

const EXPORT_USAGE = `Usage: export [--include-secrets] [--without-media] > lumi-export.json

Writes the business's settings, knowledge records and uploaded images to stdout as one JSON document, for importing into a
fresh installation of the same Lumi version. Progress and the summary go to stderr. Run it without a terminal:

  docker compose run --rm -T api export > lumi-export.json

Not exported:
${NOT_EXPORTED_SUMMARY.map((line) => `  - ${line}`).join("\n")}

  --include-secrets  Keep the webhook delivery channels' signing secrets in the file, which must then be kept private. Without
                     it, they are left out and import drops those channels, to be added again with their secrets
  --without-media    Leave the uploaded images out, e.g. when media storage isn't configured`

// Writes to stdout and waits until it is handed to the system, so the process can exit with the document complete
const write = (chunk: string) => new Promise<void>((resolve, reject) => process.stdout.write(chunk, (error) => (error ? reject(error) : resolve())))

// Reads every exported table in one snapshot: a read-only REPEATABLE READ transaction, so the rows are consistent however the
// admins edit meanwhile
async function readTables(client: PoolClient): Promise<Map<string, Row[]>> {
  const tables = new Map<string, Row[]>()
  await client.query("begin isolation level repeatable read read only")
  try {
    for (const table of TABLES) {
      // Timestamps as ISO strings to the microsecond, which JavaScript dates would round to the millisecond
      const columns = table.columns
        .map((column) =>
          column.timestamp ? `to_char(${quote(column.name)}, 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') as ${quote(column.name)}` : quote(column.name)
        )
        .join(", ")
      const order = table.primaryKey.map((column) => `r.${quote(column)}`).join(", ")
      const { rows } = await client.query<{ row: Row }>(
        `select row_to_json(r) as row from (select ${columns} from ${quote(table.name)}) r${order ? ` order by ${order}` : ""}`
      )
      tables.set(
        table.name,
        rows.map(({ row }) => row)
      )
    }
    await client.query("commit")
  } catch (error) {
    await client.query("rollback").catch(() => undefined)
    throw error
  }
  return tables
}

// Every /media/<key> path in a value, however deep in a jsonb column
function collectMediaPaths(value: unknown, found: (key: string) => void) {
  if (typeof value === "string") {
    for (const match of value.matchAll(MEDIA_PATH)) found(match[1].toLowerCase())
  } else if (Array.isArray(value)) {
    for (const item of value) collectMediaPaths(item, found)
  } else if (value && typeof value === "object") {
    for (const item of Object.values(value)) collectMediaPaths(item, found)
  }
}

// The upload keys the exported rows reference, each with where it is first referenced: the records' image columns, and
// /media/ paths in any other value (the resume logo, a business logo or avatar given as a path)
function referencedMedia(tables: Map<string, Row[]>) {
  const references = new Map<string, string>()
  for (const table of TABLES) {
    if (table.name === "uploads") continue
    for (const row of tables.get(table.name) ?? []) {
      for (const column of table.uploadKeys) {
        const key = row[column]
        if (typeof key === "string" && !references.has(key)) references.set(key, `${table.name}.${column}`)
      }
      for (const [column, value] of Object.entries(row)) {
        collectMediaPaths(value, (key) => {
          if (!references.has(key)) references.set(key, `${table.name}.${column}`)
        })
      }
    }
  }
  return references
}

// The delivery channels without their webhook secrets
function withoutSecrets(row: Row) {
  const channels = Array.isArray(row.delivery_channels) ? (row.delivery_channels as DeliveryChannelConfig[]) : []
  let removed = 0
  const kept = channels.map((channel) => {
    if (channel.type !== "webhook") return channel
    removed++
    return { key: channel.key, type: channel.type, url: channel.url }
  })
  return { row: { ...row, delivery_channels: kept }, removed }
}

export async function exportBusiness(args: string[]): Promise<number> {
  let includeSecrets: boolean
  let withoutMedia: boolean
  try {
    const { values } = parseArgs({
      args,
      options: {
        "include-secrets": { type: "boolean" },
        "without-media": { type: "boolean" },
        help: { type: "boolean", short: "h" },
      },
    })
    if (values.help) {
      console.log(EXPORT_USAGE)
      return 0
    }
    includeSecrets = values["include-secrets"] === true
    withoutMedia = values["without-media"] === true
  } catch (error) {
    console.error(`${(error as Error).message}\n\n${EXPORT_USAGE}`)
    return 2
  }
  // A terminal would show the images' data, and `docker compose run` without -T mixes stderr into the file
  if (process.stdout.isTTY) {
    console.error(
      "The export is written to stdout: redirect it to a file, and run without a terminal so the messages stay out of it:\n\n  docker compose run --rm -T api export > lumi-export.json"
    )
    return 2
  }

  const unclassified = unclassifiedTables()
  if (unclassified.length > 0) {
    console.warn(`Warning: this Lumi doesn't know whether to export these tables, so they are left out: ${unclassified.join(", ")}`)
  }

  const pool = createPool("lumi-export")
  let started = false
  try {
    const journal = readJournal()
    const checked = schemaProblem(await readSchemaState(pool, journal), journal, "export")
    if (!checked.latest) {
      console.error(`Can't export: ${checked.problem}`)
      return 1
    }

    const client = await pool.connect()
    let tables: Map<string, Row[]>
    try {
      tables = await readTables(client)
    } finally {
      client.release()
    }

    // Only the uploads the records reference: the rest were replaced or never saved with a record
    const references = referencedMedia(tables)
    const uploads = tables.get("uploads") ?? []
    const exportedUploads = uploads.filter((upload) => references.has(String(upload.key)))
    tables.set("uploads", exportedUploads)
    const uploadTypes = new Map(exportedUploads.map((upload) => [String(upload.key), String(upload.content_type)]))
    for (const [key, where] of references) {
      if (!uploadTypes.has(key)) {
        console.warn(
          `Warning: ${where} references the image ${key}, which has no upload record, so the web app doesn't serve it. It is exported if media storage has it`
        )
      }
    }

    let removedSecrets = 0
    if (!includeSecrets) {
      tables.set(
        "handoff_settings",
        (tables.get("handoff_settings") ?? []).map((row) => {
          const result = withoutSecrets(row)
          removedSecrets += result.removed
          return result.row
        })
      )
    }

    const storage = isMediaStorageConfigured() ? new S3Source() : undefined
    if (references.size > 0 && !storage && !withoutMedia) {
      console.error(
        `Can't export: the records reference ${references.size} image(s), but media storage isn't configured (S3_UPLOADS_BUCKET_NAME), so they can't be read. Configure it as the installation had it, or run export --without-media to leave the images out.`
      )
      return 1
    }

    // The document, written as it is built so the images are never all held at once
    started = true
    const header = {
      format: FORMAT,
      formatVersion: FORMAT_VERSION,
      exportedAt: new Date().toISOString(),
      lumiVersion: lumiVersion(),
      schema: { migration: checked.latest.tag, when: checked.latest.when },
      includesSecrets: includeSecrets,
    }
    await write(`${JSON.stringify(header).slice(0, -1)},"tables":{`)
    for (const [index, table] of TABLES.entries()) {
      await write(`${index ? "," : ""}${JSON.stringify(table.name)}:${JSON.stringify(tables.get(table.name) ?? [])}`)
    }
    await write(`},"media":[`)

    let mediaCount = 0
    let mediaBytes = 0
    const missing: string[] = []
    let refused = 0
    if (storage && !withoutMedia) {
      for (const key of references.keys()) {
        let file
        try {
          file = await storage.getFile(key)
        } catch (error) {
          // Amazon S3 refuses a read of a missing key when the credentials can't list the bucket, so a refused image is left out
          // like a missing one. Every image refused means the credentials can't read the storage at all, which fails below
          if (!isAccessDenied(error)) throw error
          refused++
          file = null
        }
        if (!file) {
          missing.push(key)
          console.warn(`Warning: media storage has no file for the image ${key} (${references.get(key)}), or refused to read it, so it is left out`)
          continue
        }
        const media: ExportMedia = {
          key,
          contentType: file.contentType ?? uploadTypes.get(key) ?? "application/octet-stream",
          data: Buffer.from(file.body).toString("base64"),
        }
        await write(`${mediaCount ? "," : ""}${JSON.stringify(media)}`)
        mediaCount++
        mediaBytes += file.body.byteLength
      }
    }
    if (refused > 0 && mediaCount === 0) {
      throw new Error(
        `media storage refused to read any of the ${refused} image(s): check that its credentials (S3_ACCESS_KEY_ID and S3_SECRET_ACCESS_KEY, or the AWS ones) can read the bucket`
      )
    }
    await write("]}\n")

    console.error(`\nExported Lumi ${header.lumiVersion} at schema ${header.schema.migration}:`)
    for (const table of TABLES) console.error(`  ${table.name}: ${tables.get(table.name)?.length ?? 0}`)
    console.error(`  images: ${mediaCount} (${megabytes(mediaBytes)})`)
    if (withoutMedia && references.size > 0) {
      console.error(`Left out ${references.size} image(s) (--without-media): records referencing them show no image after an import.`)
    }
    if (missing.length > 0) {
      console.error(`${missing.length} referenced image(s) were missing from media storage, or refused by it, and are not in the file.`)
    }
    if (uploads.length > exportedUploads.length) {
      console.error(`Left out ${uploads.length - exportedUploads.length} upload record(s) no record references (replaced or never saved).`)
    }
    console.error(`Not exported: ${NOT_EXPORTED_SUMMARY.join("; ")}.`)
    if (includeSecrets) {
      console.error("Warning: the file includes the webhook signing secrets (--include-secrets). Keep it private, and delete it once it is imported.")
    } else if (removedSecrets > 0) {
      console.error(
        `The signing secrets of ${removedSecrets} webhook delivery channel(s) were left out: import drops those channels, to be added again with their receivers' secrets.`
      )
    }
    console.error("The file holds the business's settings, including contact and enquiry recipient addresses: keep it private.")
    return 0
  } catch (error) {
    console.error(`Export failed: ${describeError(error)}`)
    if (started) console.error("The output is incomplete: delete it and run export again.")
    return 1
  } finally {
    await pool.end().catch(() => undefined)
  }
}

// --- Import ------------------------------------------------------------------------------------------------------------------

const IMPORT_USAGE = `Usage: import [--dry-run] < lumi-export.json

Imports an export file into this installation, which must be fresh (no business set up, no knowledge records) and at the
schema the file was exported at, i.e. run the same Lumi version. Reads the file from stdin:

  docker compose run --rm -T api import < lumi-export.json

Every row is written in one transaction, and the images to media storage before it commits: a failure imports nothing.
Before writing anything it checks that media storage accepts writes, with a small object it writes and deletes.

  --dry-run  Check the file, the installation and media storage, and insert the rows in a transaction that is rolled back,
             without importing anything or uploading the images`

async function readStdin() {
  const chunks: Buffer[] = []
  for await (const chunk of process.stdin) chunks.push(chunk as Buffer)
  return Buffer.concat(chunks)
}

// --- Reading the file --------------------------------------------------------------------------------------------------------
//
// The file is read as bytes and split into its fields and images before any of it is parsed, so it never becomes one string:
// V8's strings end at about 512 MiB, which an export with many images passes. Only JSON's structural characters are looked at,
// which are ASCII and so never part of a multi-byte UTF-8 character; each piece is then parsed with JSON.parse, which rejects
// anything malformed inside it

const WHITESPACE = new Set([0x20, 0x09, 0x0a, 0x0d])
const QUOTE = 0x22
const BACKSLASH = 0x5c

class MalformedJson extends Error {
  constructor() {
    super("The input isn't valid JSON: give the file export wrote")
  }
}

function skipWhitespace(bytes: Buffer, index: number) {
  while (index < bytes.length && WHITESPACE.has(bytes[index])) index++
  return index
}

// The end of the string opening at `index`
function skipString(bytes: Buffer, index: number) {
  for (let i = index + 1; i < bytes.length; i++) {
    if (bytes[i] === BACKSLASH) i++
    else if (bytes[i] === QUOTE) return i + 1
  }
  throw new MalformedJson()
}

// The end of the value starting at `index`
function skipValue(bytes: Buffer, index: number) {
  const first = bytes[index]
  if (first === QUOTE) return skipString(bytes, index)
  if (first === 0x7b || first === 0x5b) {
    let depth = 0
    for (let i = index; i < bytes.length; i++) {
      const byte = bytes[i]
      if (byte === QUOTE) i = skipString(bytes, i) - 1
      else if (byte === 0x7b || byte === 0x5b) depth++
      else if (byte === 0x7d || byte === 0x5d) {
        depth--
        if (depth === 0) return i + 1
      }
    }
    throw new MalformedJson()
  }
  // A number, true, false or null, which JSON.parse checks
  let i = index
  while (i < bytes.length && !WHITESPACE.has(bytes[i]) && bytes[i] !== 0x2c && bytes[i] !== 0x7d && bytes[i] !== 0x5d) i++
  if (i === index) throw new MalformedJson()
  return i
}

// The members of the object or array opening at `index`: each one's key (in an object) and where its value starts and ends
function containerMembers(bytes: Buffer, index: number) {
  const isObject = bytes[index] === 0x7b
  const close = isObject ? 0x7d : 0x5d
  const members: { key?: string; start: number; end: number }[] = []
  let i = skipWhitespace(bytes, index + 1)
  if (bytes[i] === close) return members

  for (;;) {
    let key: string | undefined
    if (isObject) {
      if (bytes[i] !== QUOTE) throw new MalformedJson()
      const keyEnd = skipString(bytes, i)
      key = parseJson(bytes, i, keyEnd) as string
      i = skipWhitespace(bytes, keyEnd)
      if (bytes[i] !== 0x3a) throw new MalformedJson()
      i = skipWhitespace(bytes, i + 1)
    }
    const end = skipValue(bytes, i)
    members.push({ key, start: i, end })
    i = skipWhitespace(bytes, end)
    if (bytes[i] === close) return members
    if (bytes[i] !== 0x2c) throw new MalformedJson()
    i = skipWhitespace(bytes, i + 1)
  }
}

function parseJson(bytes: Buffer, start: number, end: number): unknown {
  try {
    return JSON.parse(bytes.toString("utf8", start, end))
  } catch {
    throw new MalformedJson()
  }
}

// The export file in `bytes`, checked against the format, with each image decoded. Throws a message for the operator
function parseExportFile(bytes: Buffer): ExportFile {
  let start = skipWhitespace(bytes, 0)
  // A byte order mark some editors add
  if (bytes[start] === 0xef && bytes[start + 1] === 0xbb && bytes[start + 2] === 0xbf) start = skipWhitespace(bytes, start + 3)
  if (start === bytes.length) throw new Error("stdin is empty: give the export file, e.g. `import < lumi-export.json`, with -T")
  if (bytes[start] !== 0x7b) throw new Error("The input isn't a Lumi export: it isn't a JSON object")
  if (skipWhitespace(bytes, skipValue(bytes, start)) !== bytes.length) throw new MalformedJson()

  const header: Record<string, unknown> = {}
  let mediaMember: { start: number; end: number } | undefined
  for (const member of containerMembers(bytes, start)) {
    if (member.key === "media") mediaMember = member
    else header[member.key!] = parseJson(bytes, member.start, member.end)
  }

  const { format, formatVersion, lumiVersion: version } = header
  if (format !== FORMAT) throw new Error(`The input isn't a Lumi export (its format is ${JSON.stringify(format)}, not "${FORMAT}")`)
  if (formatVersion !== FORMAT_VERSION) {
    throw new Error(
      `The export's format version is ${JSON.stringify(formatVersion)}; this Lumi imports version ${FORMAT_VERSION}. Import it into an installation of Lumi ${String(version)}, which made it`
    )
  }
  const result = exportHeaderSchema.safeParse(header)
  if (!result.success) throw new Error(`It is not a valid export:\n${z.prettifyError(result.error)}`)

  if (!mediaMember || bytes[mediaMember.start] !== 0x5b) throw new Error("It is not a valid export: media must be a list of images")
  const media = containerMembers(bytes, mediaMember.start).map((member, index) => {
    const entry = exportMediaSchema.safeParse(parseJson(bytes, member.start, member.end))
    if (!entry.success) throw new Error(`It is not a valid export: image ${index + 1} of media:\n${z.prettifyError(entry.error)}`)
    return { key: entry.data.key.toLowerCase(), contentType: entry.data.contentType, body: Buffer.from(entry.data.data, "base64") }
  })

  return { ...result.data, media }
}

// The problems of the file's rows: unknown tables, and columns this schema doesn't have
function rowProblems(file: ExportFile) {
  const problems: string[] = []
  for (const name of Object.keys(file.tables)) {
    if (!TABLE_NAMES.has(name)) problems.push(`Unknown table ${name}`)
  }
  for (const table of TABLES) {
    const columns = new Set(table.columns.map((column) => column.name))
    const unknown = new Set((file.tables[table.name] ?? []).flatMap((row) => Object.keys(row).filter((column) => !columns.has(column))))
    if (unknown.size > 0) problems.push(`${table.name} has unknown columns: ${[...unknown].join(", ")}`)
  }
  return problems
}

interface HandoffImport {
  rows: Row[]
  droppedWebhooks: string[]
  enquiriesTurnedOff: boolean
  emailChannels: number
}

// The handoff settings as stored on import: webhook channels without a secret (left out by export) dropped, and enquiries
// turned off when no channel remains to deliver them. Checked with parseHandoffSettings as a save would be, so the agents can
// read what is stored
function prepareHandoff(rows: Row[]): HandoffImport {
  const result: HandoffImport = { rows: [], droppedWebhooks: [], enquiriesTurnedOff: false, emailChannels: 0 }
  for (const row of rows) {
    // As exported: a webhook may come without its secret
    const channels = Array.isArray(row.delivery_channels) ? (row.delivery_channels as { type?: string; url?: string; secret?: string }[]) : []
    const kept = channels.filter((channel) => {
      if (channel.type !== "webhook" || channel.secret) return true
      result.droppedWebhooks.push(String(channel.url))
      return false
    })
    const enquiryEnabled = row.enquiry_enabled === true && kept.length > 0
    result.enquiriesTurnedOff = row.enquiry_enabled === true && !enquiryEnabled
    result.emailChannels += kept.filter((channel) => channel.type === "email").length

    let config
    try {
      config = parseHandoffSettings(
        {
          qualificationQuestions: row.qualification_questions,
          enquiryFields: row.enquiry_fields,
          booking: row.booking,
          enquiryEnabled,
          channels: kept,
        },
        { savedChannels: kept as DeliveryChannelConfig[] }
      )
    } catch (error) {
      if (!(error instanceof HandoffSettingsError)) throw error
      throw new Error(
        `The file's enquiry and booking settings aren't valid: ${error.problems.map(({ field, message }) => `${field}: ${message}`).join("; ")}. Correct them in the exporting installation and export again`,
        { cause: error }
      )
    }
    result.rows.push({ ...row, enquiry_enabled: config.enquiryEnabled, delivery_channels: config.channels })
  }
  return result
}

// The tables the import writes that already hold rows
async function tablesWithData(client: PoolClient) {
  const { rows } = await client.query<Record<string, boolean>>(
    `select ${TABLES.map((table) => `exists (select 1 from ${quote(table.name)}) as ${quote(table.name)}`).join(", ")}`
  )
  return TABLES.map((table) => table.name).filter((name) => rows[0][name])
}

// Inserts the rows as they are, ids and timestamps included. json_populate_recordset converts each JSON value to its column's
// type: ISO strings to timestamps (to the microsecond), JSON to jsonb, arrays to Postgres arrays
async function insertRows(client: PoolClient, table: TableInfo, rows: Row[]) {
  const columns = table.columns.map((column) => quote(column.name)).join(", ")
  for (let start = 0; start < rows.length; start += INSERT_BATCH_SIZE) {
    await client.query(
      `insert into ${quote(table.name)} (${columns}) select ${columns} from json_populate_recordset(null::${quote(table.name)}, $1::json)`,
      [JSON.stringify(rows.slice(start, start + INSERT_BATCH_SIZE))]
    )
  }
}

export async function importBusiness(args: string[]): Promise<number> {
  let dryRun: boolean
  try {
    const { values } = parseArgs({ args, options: { "dry-run": { type: "boolean" }, help: { type: "boolean", short: "h" } } })
    if (values.help) {
      console.log(IMPORT_USAGE)
      return 0
    }
    dryRun = values["dry-run"] === true
  } catch (error) {
    console.error(`${(error as Error).message}\n\n${IMPORT_USAGE}`)
    return 2
  }
  if (process.stdin.isTTY) {
    console.error(`Give the export file on stdin.\n\n${IMPORT_USAGE}`)
    return 2
  }

  // The file
  let file: ExportFile
  try {
    file = parseExportFile(await readStdin())
    const problems = rowProblems(file)
    if (problems.length > 0) throw new Error(`It doesn't match this Lumi's tables:\n  - ${problems.join("\n  - ")}`)
  } catch (error) {
    console.error(`Can't import this file. ${(error as Error).message}.`)
    return 1
  }

  const pool = createPool("lumi-import")
  let uploaded = 0
  try {
    // The schema: the rows are written with this image's table definitions, so the image's latest migration must be the
    // file's, and the database fully migrated by this image
    const journal = readJournal()
    const bundled = journal.at(-1)
    if (bundled?.when !== file.schema.when) {
      console.error(
        `Can't import: this export was made by Lumi ${file.lumiVersion} at schema ${file.schema.migration}; this installation is at ${bundled?.tag ?? "no migration"} (Lumi ${lumiVersion()}). Import it into an installation of Lumi ${file.lumiVersion}, then upgrade that installation.`
      )
      return 1
    }
    const checked = schemaProblem(await readSchemaState(pool, journal), journal, "import")
    if (!checked.latest) {
      console.error(`Can't import: ${checked.problem}`)
      return 1
    }

    // The rows as stored
    const handoff = prepareHandoff(file.tables.handoff_settings ?? [])
    const rows = new Map<string, Row[]>(TABLES.map((table) => [table.name, file.tables[table.name] ?? []]))
    rows.set("handoff_settings", handoff.rows)
    // No pages come with a website, so it shows as never crawled until its pages are updated
    rows.set(
      "websites",
      rows.get("websites")!.map((website) => ({ ...website, last_processed: null }))
    )

    const { media } = file
    const storage = isMediaStorageConfigured() ? new S3Source() : undefined
    if (media.length > 0) {
      if (!storage) {
        console.error(
          `Can't import: the file has ${media.length} image(s), but media storage isn't configured (S3_UPLOADS_BUCKET_NAME). Configure it first, or export again with --without-media.`
        )
        return 1
      }
      // Before any row is written, and in a dry run too, so wrong storage settings show before the import
      try {
        await storage.checkWriteAccess()
      } catch (error) {
        console.error(
          `Can't import: media storage didn't accept a test file: ${describeError(error)}. Check S3_UPLOADS_BUCKET_NAME, S3_ENDPOINT and the storage's credentials, which must allow writing and deleting files.`
        )
        return 1
      }
    }

    const occupied = await withTransaction(
      pool,
      async (client) => {
        const occupied = await tablesWithData(client)
        if (occupied.length > 0) return occupied

        for (const table of TABLES) await insertRows(client, table, rows.get(table.name)!)
        if (!dryRun) {
          // Before the commit, so a failed upload imports nothing. The keys are kept, so the records find their images
          for (const entry of media) {
            await storage!.putFile(entry.key, entry.body, entry.contentType)
            uploaded++
          }
        }
        return []
      },
      { commit: !dryRun }
    )
    if (occupied.length > 0) {
      console.error(
        `Can't import: this installation already holds data in ${occupied.join(", ")}. Import only into a fresh installation: a new database, migrated, with no business set up (admin accounts may exist).`
      )
      return 1
    }

    const businessName = rows.get("business_settings")?.[0]?.business_name
    const total = [...rows.values()].reduce((sum, tableRows) => sum + tableRows.length, 0)
    const mediaBytes = media.reduce((sum, entry) => sum + entry.body.byteLength, 0)
    console.log(
      `\n${dryRun ? "Dry run: the import would succeed, writing" : "Imported"} ${businessName ? `${businessName}, ` : ""}from Lumi ${file.lumiVersion} at ${file.schema.migration} (exported ${file.exportedAt}):`
    )
    for (const table of TABLES) console.log(`  ${table.name}: ${rows.get(table.name)!.length}`)
    console.log(`  ${total} rows, and ${media.length} image(s) (${megabytes(mediaBytes)})${dryRun ? ", not uploaded" : ""}`)
    if (!businessName) console.log("The file has no business settings, so the onboarding wizard still runs.")
    if (handoff.droppedWebhooks.length > 0) {
      console.log(
        `${dryRun ? "Would leave out" : "Left out"} the webhook delivery channels exported without their signing secret: ${handoff.droppedWebhooks.join(", ")}`
      )
    }
    if (handoff.enquiriesTurnedOff) {
      console.log(`Enquiries ${dryRun ? "would be" : "were"} turned off: no delivery channel remains to deliver them.`)
    }
    const mediaKeys = new Set(media.map((entry) => entry.key))
    const withoutFile = rows.get("uploads")!.filter((upload) => !mediaKeys.has(String(upload.key).toLowerCase())).length
    if (withoutFile > 0) {
      console.log(
        `${withoutFile} upload record(s) have no image in the file (exported with --without-media, or missing from storage): their records show no image until one is uploaded again.`
      )
    }
    const email = channelAvailability("email")
    if (handoff.emailChannels > 0 && !email.available) {
      console.log(`Warning: ${email.reason}. Until then the email delivery channels can't deliver enquiries.`)
    }
    if (dryRun) {
      console.log("Nothing was written to the database or media storage. Run it again without --dry-run to import.")
      return 0
    }

    const websites = rows.get("websites")!
    console.log("\nNext steps:")
    const steps = [
      "Give an admin access. With Lumi sign-in (ADMIN_AUTH_PROVIDER=local), create an account: docker compose run --rm api admin-reset <email>. The onboarding wizard doesn't run, since the business is now set up",
      "Recreate the web app, which caches settings and pages for up to an hour in its container: docker compose up -d --force-recreate frontend. The backend services read the imported settings within 30 seconds",
      ...(websites.length > 0
        ? [
            `Rebuild the website search index: in the admin, Knowledge → Websites, choose Update Pages on each website:\n${websites.map((website) => `     - ${website.name} (${website.url})`).join("\n")}`,
          ]
        : []),
      ...(handoff.droppedWebhooks.length > 0
        ? [
            `Add the webhook delivery channels again, with their receivers' signing secrets, in Settings → Enquiries & booking:\n${handoff.droppedWebhooks.map((url) => `     - ${url}`).join("\n")}${handoff.enquiriesTurnedOff ? "\n   Then turn enquiries back on" : ""}`,
          ]
        : []),
    ]
    steps.forEach((step, index) => console.log(`${index + 1}. ${step}`))
    if (file.includesSecrets) console.log("\nThe export file holds webhook signing secrets: delete it once you no longer need it.")
    return 0
  } catch (error) {
    console.error(`Import failed: ${describeError(error)}`)
    console.error(
      `Nothing was imported into the database: fix the problem and run import again.${uploaded > 0 ? ` The ${uploaded} image(s) already uploaded stay in media storage, and the rerun overwrites them.` : ""}`
    )
    return 1
  } finally {
    await pool.end().catch(() => undefined)
  }
}
