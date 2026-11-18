import { existsSync } from "node:fs"
import { COUNT_LIMITS, DAILY_SPEND_LIMIT_VARIABLE, parseAmount, parseCount } from "@/ai/agents/limitSettings"
import { MIN_TOKEN_SECRET_LENGTH, missingWorkspaceSignInSettings, parseAuthProvider, workspaceSignInSettings } from "@/mcp/settings"
import { decodeCaCertificates } from "@/utils/caCertificates"
import { decodeServiceAccountKey } from "@/utils/serviceAccountKey"
import { isPlaceholderSecret } from "@lumi/shared-contracts/secrets"

// The configuration each container command needs, checked at startup before anything connects: every problem is reported in
// one message that says how to fix it, and the command exits. Optional integrations are logged as on or off. Secret values
// (API_KEY, DB_PASSWORD, OPENAI_API_KEY, SMTP_URL, credentials) are never printed

export const COMMANDS = [
  "api",
  "agents",
  "worker",
  "mcp",
  "migrate",
  "admin-reset",
  "checkpoint-cleanup",
  "status",
  "export",
  "import",
  "delete-conversations",
] as const
export type Command = (typeof COMMANDS)[number]

// The ports the services listen on unless PORT is set
export const DEFAULT_PORTS = { api: 4000, agents: 4200, mcp: 4300, worker: 4500 } as const

// The time a weekly checkpoint cleanup run (worker.ts) or a checkpoint-cleanup command (oneOff.ts) gets; the next run continues
export const CHECKPOINT_CLEANUP_TIME_BUDGET_MS = 60 * 60 * 1000

// The worker's conversation retention (worker.ts): unset or empty keeps conversations until they are deleted by hand
export const CONVERSATION_RETENTION_VARIABLE = "CONVERSATION_RETENTION_DAYS"
const MAX_RETENTION_DAYS = 36_500

// The days of CONVERSATION_RETENTION_DAYS, a whole number from 1 to MAX_RETENTION_DAYS, or undefined when it is unset or
// invalid (which validateConfig reports)
export function conversationRetentionDays(): number | undefined {
  const value = env(CONVERSATION_RETENTION_VARIABLE)
  if (value === undefined || !/^\d+$/.test(value)) return undefined
  const days = Number(value)
  return days >= 1 && days <= MAX_RETENTION_DAYS ? days : undefined
}

// Where the image has Chromium's headless shell for the PDF service (backend/Dockerfile)
export const DEFAULT_CHROMIUM_PATH = "/usr/bin/chromium-headless-shell"

const MIN_API_KEY_LENGTH = 32

interface Report {
  problems: string[]
  warnings: string[]
  integrations: string[]
}

const env = (name: string) => process.env[name]?.trim() || undefined

function parseUrl(value: string) {
  const url = URL.parse(value)
  return url && (url.protocol === "http:" || url.protocol === "https:") ? url : undefined
}

function required(report: Report, name: string, howToFix: string) {
  if (!env(name)) {
    report.problems.push(`${name} is not set: ${howToFix}`)
    return false
  }
  return true
}

function checkBoolean(report: Report, name: string) {
  const value = env(name)
  if (value !== undefined && value !== "true" && value !== "false") {
    report.problems.push(`${name} must be "true" or "false"`)
  }
}

function checkUrl(report: Report, name: string, example: string) {
  const value = env(name)
  if (value !== undefined && !parseUrl(value)) {
    report.problems.push(`${name} is not a valid http(s) URL: set it to a full URL such as ${example}`)
  }
}

// The variable deploy/.env.example sets a secret with, where it differs from the one the backend reads (deploy/compose.services.yaml)
const ENV_FILE_NAMES: Record<string, string> = { API_KEY: "LUMI_API_KEY" }

const RANDOM_SECRET = "replace it with a random secret, e.g. the output of `openssl rand -hex 32`"

// Refuses a secret still holding deploy/.env.example's placeholder (replace-with-…, sk-replace-me): it is published, so it is
// no secret. Returns whether the value passed
function checkPlaceholder(report: Report, name: string, howToFix: string) {
  if (!isPlaceholderSecret(process.env[name] ?? "")) return true

  const envFileName = ENV_FILE_NAMES[name]
  report.problems.push(`${name} is still the example value from deploy/.env.example${envFileName ? ` (${envFileName} there)` : ""}: ${howToFix}`)
  return false
}

// The limits of the public chat (src/ai/agents/limitSettings.ts): whole numbers of at least 0, where 0 turns one off, and a
// daily spending limit in US dollars. Unset or empty keeps the default
function checkAgentLimits(report: Report) {
  for (const { variable, defaultValue } of Object.values(COUNT_LIMITS)) {
    const value = env(variable)
    if (value !== undefined && parseCount(value) === undefined) {
      report.problems.push(`${variable} must be a whole number of at least 0 (0 turns the limit off; default ${defaultValue})`)
    }
  }

  const spendLimit = env(DAILY_SPEND_LIMIT_VARIABLE)
  if (spendLimit !== undefined && parseAmount(spendLimit) === undefined) {
    report.problems.push(`${DAILY_SPEND_LIMIT_VARIABLE} must be an amount of US dollars above 0, such as 20 or 7.50, or empty for no limit`)
  }
  report.integrations.push(
    spendLimit && parseAmount(spendLimit) !== undefined
      ? `daily spending limit: ${spendLimit} USD (the chat is unavailable for the rest of the UTC day once it is reached)`
      : `daily spending limit: off (set ${DAILY_SPEND_LIMIT_VARIABLE} to stop the chat once a day's model spending reaches it)`
  )
}

// The Compose installation runs a database and media storage of its own unless deploy/.env names ones the operator
// already runs: DB_HOST for the database, S3_UPLOADS_BUCKET_NAME for the storage. Compose derives LUMI_BUNDLED_DATABASE and
// LUMI_BUNDLED_STORAGE from them (deploy/bundled.env), 1 or 0, starts or leaves out its `postgres` and `storage` services by
// them, and passes them on with the DB_* and S3_* settings as the operator left them. With a bundled service, the settings
// the backend reads are set here, and any the operator filled in are reported, as they would otherwise be ignored. Unset, as
// outside Compose, nothing is bundled
const BUNDLED_DATABASE = {
  // The postgres service on the installation's private network, as deploy/compose.services.yaml creates it
  host: "postgres",
  port: "5432",
  user: "lumi",
  name: "lumi",
}
// The settings of a database of the operator's own, besides the host name that chooses it
const OWN_DATABASE_SETTINGS = ["DB_PORT", "DB_USER", "DB_PASSWORD", "DB_NAME", "DB_SSL", "DB_SSL_REJECT_UNAUTHORIZED", "DB_SSL_CA"]

const BUNDLED_STORAGE = {
  // The SeaweedFS S3 gateway on the installation's private network
  endpoint: "http://storage:8333",
  // Also the path the proxy forwards uploads on (deploy/Caddyfile) and the bucket SeaweedFS creates (deploy/compose.services.yaml)
  bucket: "lumi-media",
  accessKeyId: "lumi",
}
// The settings of storage of the operator's own, besides the bucket name that chooses it
const OWN_STORAGE_SETTINGS = ["S3_ENDPOINT", "S3_PUBLIC_ENDPOINT", "S3_REGION", "S3_ACCESS_KEY_ID", "S3_SECRET_ACCESS_KEY"]

export const usesBundledDatabase = () => env("LUMI_BUNDLED_DATABASE") === "1"
export const usesBundledStorage = () => env("LUMI_BUNDLED_STORAGE") === "1"

const ownSettingsProblem = (own: string[], chooser: string, what: string) =>
  `${own.join(", ")} ${own.length === 1 ? "is" : "are"} set for ${what} of your own, but ${chooser} isn't, so the bundled one runs: set ${chooser} to use yours, or empty ${own.length === 1 ? "it" : "them"} to use the bundled one`

// With the bundled database, sets the DB_* settings for it, from POSTGRES_PASSWORD. Returns whether the database settings can
// be checked further: not when a problem with them is already reported
function useBundledDatabase(report: Report) {
  if (!usesBundledDatabase()) {
    // Any DB_HOST turns the bundled database off, the one it names included
    if (env("LUMI_BUNDLED_DATABASE") === "0" && env("DB_HOST") === BUNDLED_DATABASE.host) {
      report.problems.push(
        `DB_HOST is "${BUNDLED_DATABASE.host}", the bundled database's name, but setting DB_HOST turns the bundled database off: empty DB_HOST and the other DB_* settings to use the bundled database, or set DB_HOST to your own server`
      )
      return false
    }
    return true
  }

  const own = OWN_DATABASE_SETTINGS.filter((name) => env(name))
  if (own.length > 0) {
    report.problems.push(ownSettingsProblem(own, "DB_HOST", "a database"))
    return false
  }

  // Not trimmed: the database was created with the exact value
  const password = process.env.POSTGRES_PASSWORD
  if (!password?.trim()) {
    report.problems.push(
      "POSTGRES_PASSWORD is not set, and the bundled database needs it: set it to the password the database was created with, or a random secret for a new one, or set DB_HOST to use a database of your own"
    )
    return false
  }
  // The database only takes POSTGRES_PASSWORD when its volume is created, so an existing one keeps the placeholder until the
  // password is changed in it first
  if (
    !checkPlaceholder(
      report,
      "POSTGRES_PASSWORD",
      `${RANDOM_SECRET}. If the database already exists, change the password in it first, then in deploy/.env (https://docs.lumi.nieve.ai/self-hosting#changing-the-database-password), or the services can no longer connect`
    )
  ) {
    return false
  }

  process.env.DB_HOST = BUNDLED_DATABASE.host
  process.env.DB_PORT = BUNDLED_DATABASE.port
  process.env.DB_USER = BUNDLED_DATABASE.user
  process.env.DB_NAME = BUNDLED_DATABASE.name
  process.env.DB_PASSWORD = password
  return true
}

// What keeps the bundled storage from working, or undefined. A setting meant for storage of the operator's own, or a missing,
// example or padded LUMI_STORAGE_SECRET_KEY, which the storage service refuses to start without
export function bundledStorageProblem(): string | undefined {
  const own = OWN_STORAGE_SETTINGS.filter((name) => env(name))
  if (own.length > 0) return ownSettingsProblem(own, "S3_UPLOADS_BUCKET_NAME", "media storage")

  // Not trimmed: SeaweedFS takes the exact value
  const secretKey = process.env.LUMI_STORAGE_SECRET_KEY ?? ""
  if (!secretKey.trim()) {
    return "LUMI_STORAGE_SECRET_KEY is not set, and the bundled media storage needs it: set it to a random secret, e.g. the output of `openssl rand -hex 32`, or set the S3_* settings to use storage of your own"
  }
  if (isPlaceholderSecret(secretKey)) return `LUMI_STORAGE_SECRET_KEY is still the example value from deploy/.env.example: ${RANDOM_SECRET}`
  // The storage code trims the key it signs with (src/apollo/sources/s3Source.ts)
  if (secretKey !== secretKey.trim()) {
    return "LUMI_STORAGE_SECRET_KEY starts or ends with whitespace, which the storage keeps and the services drop: use a key of letters and digits only, e.g. the output of `openssl rand -hex 32`"
  }
  return undefined
}

// With the bundled storage, points the S3_* settings the storage code reads (src/apollo/sources/s3Source.ts) at it: the
// services reach it on the private network, and browsers upload through the proxy at the installation's own address, so the
// upload URLs are signed for that address. Only for the commands that use media storage, before anything reads the settings.
// Without it the api serves everything but images, and status reports why; export and import would leave the images out,
// so they stop
function useBundledStorage(report: Report, command: Command) {
  if (!usesBundledStorage()) return

  const problem = bundledStorageProblem()
  if (problem) {
    if (command === "export" || command === "import") report.problems.push(problem)
    else if (command === "api") report.warnings.push(`Media storage is off, so images can't be uploaded or shown: ${problem}`)
    return
  }

  process.env.S3_UPLOADS_BUCKET_NAME = BUNDLED_STORAGE.bucket
  process.env.S3_ENDPOINT = BUNDLED_STORAGE.endpoint
  process.env.S3_FORCE_PATH_STYLE = "true"
  process.env.S3_ACCESS_KEY_ID = BUNDLED_STORAGE.accessKeyId
  process.env.S3_SECRET_ACCESS_KEY = process.env.LUMI_STORAGE_SECRET_KEY
  const publicUrl = env("APP_BASE_URL")
  if (publicUrl) process.env.S3_PUBLIC_ENDPOINT = publicUrl
}

function checkDatabase(report: Report) {
  if (env("DB_SECRET_ARN")) {
    report.problems.push("DB_SECRET_ARN is set: it is only for the AWS Lambdas. Unset it and connect with the DB_* variables")
  }

  required(report, "DB_HOST", "set it to the PostgreSQL server's host name")
  required(report, "DB_USER", "set it to the PostgreSQL user Lumi connects as")
  if (required(report, "DB_PASSWORD", "set it to that user's password") && !usesBundledDatabase()) {
    checkPlaceholder(report, "DB_PASSWORD", "set it to the password of the PostgreSQL user Lumi connects as")
  }
  required(report, "DB_NAME", "set it to the database Lumi uses (e.g. lumi)")

  const port = env("DB_PORT")
  if (port !== undefined && !isPort(port)) {
    report.problems.push(`DB_PORT must be a port number between 1 and 65535 (default 5432)`)
  }
  checkBoolean(report, "DB_SSL")
  checkBoolean(report, "DB_SSL_REJECT_UNAUTHORIZED")
  const tls = env("DB_SSL") === "true"
  if (tls && env("DB_SSL_REJECT_UNAUTHORIZED") === "false") {
    report.warnings.push(
      "DB_SSL_REJECT_UNAUTHORIZED=false: the database's certificate isn't verified, so the connection can be intercepted. Prefer DB_SSL_CA with the certificate authority of your database's certificate"
    )
  }

  const ca = env("DB_SSL_CA")
  if (ca !== undefined) {
    if (!decodeCaCertificates(ca)) {
      report.problems.push(
        "DB_SSL_CA is not a base64-encoded PEM certificate: encode the certificate authority's .pem file on one line, e.g. `base64 -w0 global-bundle.pem`, or unset it"
      )
    } else if (!tls) {
      report.warnings.push("DB_SSL_CA is set but DB_SSL isn't true, so the connection doesn't use TLS: set DB_SSL=true")
    }
  }
}

function isPort(value: string) {
  const port = Number(value)
  return /^\d+$/.test(value) && port >= 1 && port <= 65535
}

function checkPort(report: Report, service: keyof typeof DEFAULT_PORTS) {
  const port = env("PORT")
  if (port !== undefined && !isPort(port)) {
    report.problems.push(`PORT must be a port number between 1 and 65535 (default ${DEFAULT_PORTS[service]})`)
  }
}

function checkApiKey(report: Report) {
  // Not trimmed: the key must be exactly what the web app sends
  const apiKey = process.env.API_KEY
  if (!apiKey) {
    report.problems.push(
      `API_KEY is not set: set it to a random secret of at least ${MIN_API_KEY_LENGTH} characters (e.g. the output of \`openssl rand -hex 32\`), the same in the web app, api, agents and worker`
    )
  } else if (apiKey.length < MIN_API_KEY_LENGTH) {
    report.problems.push(
      `API_KEY is too short (${apiKey.length} characters): use a random secret of at least ${MIN_API_KEY_LENGTH} characters (e.g. the output of \`openssl rand -hex 32\`), and set the same in the web app`
    )
  } else if (!checkPlaceholder(report, "API_KEY", `${RANDOM_SECRET}, the same in the web app, api, agents and worker`)) {
    return
  } else if (/\s/.test(apiKey)) {
    report.problems.push(
      "API_KEY contains whitespace, which HTTP headers don't keep: use a key of letters and digits only (e.g. `openssl rand -hex 32`)"
    )
  }
}

function checkOpenAi(report: Report) {
  if (
    required(report, "OPENAI_API_KEY", "set it to an OpenAI API key (https://platform.openai.com/api-keys); Lumi uses OpenAI for chat and embeddings")
  ) {
    checkPlaceholder(report, "OPENAI_API_KEY", "replace it with your OpenAI API key (https://platform.openai.com/api-keys)")
  }
}

function checkAppBaseUrl(report: Report) {
  if (required(report, "APP_BASE_URL", "set it to the public URL of the installation's web app, e.g. https://lumi.example.com")) {
    checkUrl(report, "APP_BASE_URL", "https://lumi.example.com")
  }
}

function checkAllowedOrigins(report: Report) {
  const value = env("AGENTS_ALLOWED_ORIGINS")
  if (!value) {
    report.problems.push(
      "AGENTS_ALLOWED_ORIGINS is not set: set it to the web app's public origin, e.g. https://lumi.example.com (comma-separated for several)"
    )
    return
  }

  for (const origin of value.split(",").map((entry) => entry.trim())) {
    const url = parseUrl(origin)
    if (!url || url.origin !== origin) {
      report.problems.push(
        `AGENTS_ALLOWED_ORIGINS has "${origin}", which is not an origin: give scheme, host and port only, without a path or trailing slash (e.g. https://lumi.example.com)`
      )
    }
  }
}

function hasAwsCredentials() {
  return Boolean(
    env("AWS_ACCESS_KEY_ID") ||
    env("AWS_PROFILE") ||
    env("AWS_WEB_IDENTITY_TOKEN_FILE") ||
    env("AWS_CONTAINER_CREDENTIALS_FULL_URI") ||
    env("AWS_CONTAINER_CREDENTIALS_RELATIVE_URI")
  )
}

function checkEmail(report: Report) {
  const smtpUrl = env("SMTP_URL")
  if (smtpUrl !== undefined) {
    const url = URL.parse(smtpUrl)
    if (!url || (url.protocol !== "smtp:" && url.protocol !== "smtps:")) {
      report.problems.push("SMTP_URL is not a valid SMTP URL: use smtp://user:password@host:587 or smtps://user:password@host:465")
    }
  }

  if (!env("EMAIL_FROM")) {
    report.integrations.push("email: off (set EMAIL_FROM and SMTP_URL to send enquiry and meeting emails)")
    if (smtpUrl) report.warnings.push("SMTP_URL is set but EMAIL_FROM isn't, so no email is sent: set EMAIL_FROM to the sender address")
    return
  }

  if (smtpUrl) {
    report.integrations.push("email: on (SMTP)")
  } else {
    report.integrations.push("email: on (Amazon SES)")
    if (!hasAwsCredentials()) {
      report.warnings.push(
        "EMAIL_FROM is set without SMTP_URL, so email goes through Amazon SES, but no AWS credentials are configured: sending will fail. Set SMTP_URL to your SMTP server (smtp://user:password@host:587)"
      )
    }
  }
}

function checkGoogleCalendar(report: Report) {
  const credentials = env("GOOGLE_SERVICE_ACCOUNT_CREDENTIALS")
  if (!credentials) {
    report.integrations.push("Google Calendar booking: off (set GOOGLE_SERVICE_ACCOUNT_CREDENTIALS to book meetings in Google Calendar)")
    return
  }

  if (decodeServiceAccountKey(credentials)) {
    report.integrations.push("Google Calendar booking: on")
  } else {
    report.problems.push(
      "GOOGLE_SERVICE_ACCOUNT_CREDENTIALS is not a base64-encoded service account key: encode the key's JSON file (with client_email and private_key), e.g. `base64 -w0 key.json`, or unset it"
    )
  }
}

// `browserUploads` for the services admins' browsers upload through; the export and import commands only reach the storage
// from the container
function checkMediaStorage(report: Report, { browserUploads = true } = {}) {
  checkUrl(report, "S3_ENDPOINT", "http://minio:9000")
  checkUrl(report, "S3_PUBLIC_ENDPOINT", "https://storage.lumi.example.com")
  checkBoolean(report, "S3_FORCE_PATH_STYLE")

  const bucket = env("S3_UPLOADS_BUCKET_NAME")
  const endpoint = env("S3_ENDPOINT")
  if (!bucket && usesBundledStorage()) {
    // Reported by useBundledStorage
    report.integrations.push("media storage: off (the bundled storage isn't set up)")
    return
  }
  if (!bucket) {
    report.integrations.push("media storage: off (set S3_UPLOADS_BUCKET_NAME, and S3_ENDPOINT for S3-compatible storage, to upload images and files)")
    if (endpoint) report.warnings.push("S3_ENDPOINT is set but S3_UPLOADS_BUCKET_NAME isn't, so media storage is off: set the bucket name")
    return
  }

  if (usesBundledStorage()) {
    report.integrations.push(
      `media storage: on (bundled, the storage service; browsers upload through ${env("S3_PUBLIC_ENDPOINT") ?? "APP_BASE_URL"})`
    )
  } else if (endpoint) {
    const origin = parseUrl(endpoint)?.origin ?? "an invalid URL"
    report.integrations.push(`media storage: on (S3-compatible storage at ${origin}, bucket ${bucket})`)
    if (!env("S3_ACCESS_KEY_ID") || !env("S3_SECRET_ACCESS_KEY")) {
      report.warnings.push("S3_ENDPOINT is set without S3_ACCESS_KEY_ID and S3_SECRET_ACCESS_KEY: set the storage's access key and secret in them")
    }
    if (browserUploads && env("S3_PUBLIC_ENDPOINT") === undefined) {
      report.warnings.push(
        `Browsers upload media straight to S3_ENDPOINT (${origin}): if they can't reach it, set S3_PUBLIC_ENDPOINT to the storage's public URL`
      )
    }
  } else {
    if (!env("S3_REGION") && !env("AWS_REGION")) {
      report.problems.push(
        "S3_UPLOADS_BUCKET_NAME is set for Amazon S3 without a region: set S3_REGION (e.g. eu-west-1), or S3_ENDPOINT for S3-compatible storage"
      )
    }
    report.integrations.push(`media storage: on (Amazon S3, bucket ${bucket})`)
  }
}

function checkCrawlerDispatch(report: Report) {
  checkUrl(report, "WEBSITE_CRAWLER_URL", "http://worker:4500")
  const url = env("WEBSITE_CRAWLER_URL")
  if (url) {
    report.integrations.push(`website crawler: the worker at ${parseUrl(url)?.origin ?? url}`)
  } else if (env("WEBSITE_CRAWLER_FUNCTION_NAME")) {
    report.integrations.push("website crawler: the AWS Lambda WEBSITE_CRAWLER_FUNCTION_NAME names")
  } else {
    report.warnings.push("WEBSITE_CRAWLER_URL is not set, so website crawls can't be started: set it to the worker's URL, e.g. http://worker:4500")
  }
}

function checkPdf(report: Report) {
  const path = env("PUPPETEER_EXECUTABLE_PATH") ?? DEFAULT_CHROMIUM_PATH
  if (existsSync(path)) {
    report.integrations.push(`PDF resumes: on (Chromium at ${path})`)
  } else {
    report.warnings.push(`Chromium was not found at ${path}, so PDF resumes can't be generated: set PUPPETEER_EXECUTABLE_PATH to its path`)
  }
}

function checkTracing(report: Report) {
  const publicKey = env("LANGFUSE_PUBLIC_KEY")
  const secretKey = env("LANGFUSE_SECRET_KEY")
  checkUrl(report, "LANGFUSE_BASE_URL", "https://cloud.langfuse.com")
  if (publicKey && secretKey) {
    report.integrations.push(`Langfuse tracing: on (${env("LANGFUSE_BASE_URL") ?? "Langfuse Cloud"})`)
  } else {
    report.integrations.push("Langfuse tracing: off")
    if (publicKey || secretKey)
      report.warnings.push("Only one of LANGFUSE_PUBLIC_KEY and LANGFUSE_SECRET_KEY is set, so tracing is off: set both, or neither")
  }
}

function checkCleanupSchedule(report: Report) {
  const value = env("CHECKPOINT_CLEANUP_SCHEDULE")
  if (value !== undefined && value !== "on" && value !== "off") {
    report.problems.push('CHECKPOINT_CLEANUP_SCHEDULE must be "on" (the default) or "off"')
  }
  report.integrations.push(
    value === "off" ? "weekly checkpoint cleanup: off (CHECKPOINT_CLEANUP_SCHEDULE=off)" : "weekly checkpoint cleanup: on (Sundays at 03:00 UTC)"
  )
}

function checkConversationRetention(report: Report) {
  const value = env(CONVERSATION_RETENTION_VARIABLE)
  if (value === undefined) {
    report.integrations.push(
      `conversation retention: off (set ${CONVERSATION_RETENTION_VARIABLE} to delete conversations after that many days without activity)`
    )
    return
  }

  const days = conversationRetentionDays()
  if (days === undefined) {
    report.problems.push(
      `${CONVERSATION_RETENTION_VARIABLE} must be a whole number of days from 1 to ${MAX_RETENTION_DAYS}, or empty to keep conversations until they are deleted by hand`
    )
    return
  }
  report.integrations.push(
    `conversation retention: on (conversations with no activity for ${days} day${days === 1 ? "" : "s"} are deleted daily at 02:30 UTC)`
  )
}

// The MCP server (src/mcp/config.ts). Its public tools need only the database; team sign-in, and with it the team tools, needs
// every Google setting, as isAuthConfigured() checks
function checkMcp(report: Report) {
  const baseUrl = env("MCP_BASE_URL")
  if (!baseUrl) {
    report.problems.push("MCP_BASE_URL is not set: set it to the installation's public origin, e.g. https://lumi.example.com, where /mcp is served")
  } else {
    const url = parseUrl(baseUrl)
    if (!url || url.origin !== baseUrl) {
      report.problems.push(
        `MCP_BASE_URL "${baseUrl}" is not an origin: give scheme, host and port only, without a path or trailing slash (e.g. https://lumi.example.com)`
      )
    } else if (url.protocol !== "https:") {
      report.warnings.push(
        "MCP_BASE_URL is not https: MCP clients such as ChatGPT only connect to https servers, and sign-in cookies aren't marked secure"
      )
    }
  }

  // Not trimmed: the key is derived from the exact value
  const tokenSecret = process.env.MCP_TOKEN_SECRET
  if (!tokenSecret) {
    report.problems.push(
      "MCP_TOKEN_SECRET is not set: set it to a random secret of at least 32 characters (e.g. the output of `openssl rand -hex 32`). It signs the MCP access tokens; changing it signs everyone out"
    )
  } else if (!checkPlaceholder(report, "MCP_TOKEN_SECRET", RANDOM_SECRET)) {
    // Reported by checkPlaceholder
  } else if (tokenSecret.length < MIN_TOKEN_SECRET_LENGTH || new Set(tokenSecret).size < 8) {
    report.problems.push(
      `MCP_TOKEN_SECRET is too weak (${tokenSecret.length < MIN_TOKEN_SECRET_LENGTH ? `${tokenSecret.length} characters` : "too few distinct characters"}): use a random secret of at least ${MIN_TOKEN_SECRET_LENGTH} characters (e.g. the output of \`openssl rand -hex 32\`)`
    )
  }

  for (const origin of (env("MCP_ALLOWED_REDIRECT_ORIGINS") ?? "")
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean)) {
    const url = parseUrl(origin)
    if (!url || url.origin !== origin) {
      report.problems.push(
        `MCP_ALLOWED_REDIRECT_ORIGINS has "${origin}", which is not an origin: give scheme, host and port only (e.g. https://chatgpt.com)`
      )
    }
  }
  checkBoolean(report, "MCP_ALLOW_LOOPBACK_REDIRECTS")
  if (env("MCP_ALLOW_LOOPBACK_REDIRECTS") === "true") {
    report.warnings.push(
      "MCP_ALLOW_LOOPBACK_REDIRECTS=true lets OAuth clients redirect to http://localhost: only for local tools such as the MCP Inspector"
    )
  }

  checkUrl(report, "APP_BASE_URL", "https://lumi.example.com")
  // Optional here: only the team tool that drafts a project from a URL uses it
  if (env("OPENAI_API_KEY")) checkPlaceholder(report, "OPENAI_API_KEY", "replace it with your OpenAI API key, or unset it")

  // As the web app reads it (src/mcp/settings.ts). Compose sets local when deploy/.env leaves it empty
  const provider = parseAuthProvider(process.env.ADMIN_AUTH_PROVIDER)
  if (provider === "local") {
    report.integrations.push(
      "MCP team sign-in (Lumi admin accounts): on, serving the public tools anonymously and the team tools to signed-in admins"
    )
    if (!env("OPENAI_API_KEY")) {
      report.warnings.push("OPENAI_API_KEY is not set, so the team tool that drafts a project from a URL fails: set it to an OpenAI API key")
    }
    return
  }
  if (provider === null) {
    report.problems.push(
      `ADMIN_AUTH_PROVIDER is ${env("ADMIN_AUTH_PROVIDER") ? `"${env("ADMIN_AUTH_PROVIDER")}", which is not a sign-in method` : "not set"}: set it to "local" for Lumi admin accounts or "workspace" for Google Workspace, as for the web app`
    )
    return
  }

  if (env("GOOGLE_DIRECTORY_CREDENTIALS") && !decodeServiceAccountKey(env("GOOGLE_DIRECTORY_CREDENTIALS"))) {
    report.problems.push(
      "GOOGLE_DIRECTORY_CREDENTIALS is not a base64-encoded service account key: encode the key's JSON file (with client_email and private_key), e.g. `base64 -w0 key.json`, or unset it"
    )
  }

  // The same settings the MCP server checks before turning team sign-in on (src/mcp/config.ts)
  const missing = missingWorkspaceSignInSettings(process.env)
  if (missing.length === 0) {
    report.integrations.push("MCP team sign-in (Google Workspace): on, serving the public tools anonymously and the team tools to signed-in members")
    if (!env("OPENAI_API_KEY")) {
      report.warnings.push("OPENAI_API_KEY is not set, so the team tool that drafts a project from a URL fails: set it to an OpenAI API key")
    }
  } else {
    report.integrations.push("MCP team sign-in (Google Workspace): off, serving only the public tools, anonymously")
    if (missing.length < workspaceSignInSettings(process.env).length) {
      report.warnings.push(`MCP team sign-in is off because these are missing or invalid: ${missing.join(", ")}. Set them all, or none`)
    }
  }
}

function checkCommand(command: Command): Report {
  const report: Report = { problems: [], warnings: [], integrations: [] }
  if (useBundledDatabase(report)) checkDatabase(report)

  switch (command) {
    case "api":
      useBundledStorage(report, command)
      checkPort(report, "api")
      checkApiKey(report)
      checkOpenAi(report)
      checkAppBaseUrl(report)
      checkCrawlerDispatch(report)
      checkMediaStorage(report)
      checkEmail(report)
      checkGoogleCalendar(report)
      checkPdf(report)
      break
    case "agents":
      checkPort(report, "agents")
      checkApiKey(report)
      checkOpenAi(report)
      checkAppBaseUrl(report)
      checkAllowedOrigins(report)
      checkAgentLimits(report)
      checkEmail(report)
      checkGoogleCalendar(report)
      checkTracing(report)
      break
    case "mcp":
      checkPort(report, "mcp")
      checkMcp(report)
      break
    case "worker":
      checkPort(report, "worker")
      checkApiKey(report)
      checkOpenAi(report)
      checkCleanupSchedule(report)
      checkConversationRetention(report)
      break
    // They read and write images in media storage when it is configured; the other one-off commands only need the database
    case "export":
    case "import":
      useBundledStorage(report, command)
      checkMediaStorage(report, { browserUploads: false })
      break
    // It reports the media storage, and why the bundled one isn't set up
    case "status":
      useBundledStorage(report, command)
      break
  }

  return report
}

// The database the command connects to, without its password
export function describeDatabase() {
  const address = `${env("DB_USER")}@${env("DB_HOST")}:${env("DB_PORT") ?? "5432"}/${env("DB_NAME")}`
  let tls: string | undefined
  if (env("DB_SSL") === "true") {
    if (env("DB_SSL_REJECT_UNAUTHORIZED") === "false") tls = "TLS without certificate verification"
    else tls = env("DB_SSL_CA") ? "TLS, verified with DB_SSL_CA" : "TLS"
  }
  return `${usesBundledDatabase() ? "bundled" : "external"} database ${address}${tls ? ` (${tls})` : ""}`
}

// The media storage in use, without its credentials
export function describeMediaStorage() {
  const bucket = env("S3_UPLOADS_BUCKET_NAME")
  if (!bucket) return usesBundledStorage() ? "bundled storage, not set up" : "off"
  if (usesBundledStorage()) return `bundled storage, bucket ${bucket}`
  const endpoint = env("S3_ENDPOINT")
  return endpoint ? `external S3-compatible storage at ${parseUrl(endpoint)?.origin ?? endpoint}, bucket ${bucket}` : `Amazon S3, bucket ${bucket}`
}

// Checks the command's configuration: exits with every problem listed, or logs the database it connects to, the optional
// integrations and any warnings
export function validateConfig(command: Command) {
  const { problems, warnings, integrations } = checkCommand(command)

  if (problems.length > 0) {
    console.error(
      [
        `Lumi ${command} can't start: its configuration has ${problems.length === 1 ? "a problem" : `${problems.length} problems`}.`,
        ...problems.map((problem) => `  - ${problem}`),
        "Set these environment variables (e.g. in the env file Docker Compose reads) and start it again.",
      ].join("\n")
    )
    process.exit(1)
  }

  console.log(`Lumi ${command}: ${describeDatabase()}`)
  if (integrations.length > 0) {
    console.log(`Optional integrations:\n${integrations.map((line) => `  - ${line}`).join("\n")}`)
  }
  for (const warning of warnings) {
    console.warn(`Warning: ${warning}`)
  }
}

export function servicePort(service: keyof typeof DEFAULT_PORTS) {
  const port = env("PORT")
  return port ? Number(port) : DEFAULT_PORTS[service]
}
