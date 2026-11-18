import { readFileSync } from "node:fs"
import { createSecureContext } from "node:tls"
import { decodeCaCertificates } from "@/utils/caCertificates"
import { GetSecretValueCommand, SecretsManagerClient } from "@aws-sdk/client-secrets-manager"
import type { DbType } from "@db/db"
import * as schema from "@db/schema"
import { drizzle } from "drizzle-orm/node-postgres"
import { Pool, type PoolClient, type PoolConfig } from "pg"

// Every Amazon CA, RDS's among them, as the Lambda Node.js runtimes ship it. From Node.js 20 Lambda no longer trusts these
// by default, so the RDS certificate is verified against this file
const LAMBDA_AMAZON_CA_BUNDLE = "/var/runtime/ca-cert.pem"

// Pool settings a caller may tune for how it is invoked
type DbPoolOptions = Pick<
  PoolConfig,
  | "idleTimeoutMillis"
  | "max"
  | "connectionTimeoutMillis"
  | "query_timeout"
  | "statement_timeout"
  | "lock_timeout"
  | "idle_in_transaction_session_timeout"
  | "keepAlive"
>

// For Lambdas serving requests: pg closes a connection after 10 idle seconds by default, and requests to a warm container are
// usually further apart, so each would reconnect (TCP, TLS and SCRAM). Its timer cannot be trusted either, since a frozen
// Lambda runs no timers, so lambdaDb retires connections itself. Up to 4 serve one request's concurrent queries. Connecting
// and each query time out rather than wait on a dead network path until the Lambda times out
const LAMBDA_POOL_OPTIONS: DbPoolOptions = { idleTimeoutMillis: 0, max: 4, connectionTimeoutMillis: 10_000, query_timeout: 30_000 }

const MAX_IDLE_MS = 4 * 60 * 1000

// The pool settings of the DB_* variables, which local development and the container installation connect with. DB_SSL=true
// connects with TLS and verifies the server's certificate against the publicly trusted authorities, or only those of DB_SSL_CA
// (base64-encoded PEM) for a server whose authority isn't one, such as Amazon RDS. DB_SSL_REJECT_UNAUTHORIZED=false skips the
// check, e.g. for a development server's self-signed certificate, which leaves the connection open to interception
export function envPoolConfig(applicationName: string): PoolConfig {
  const ca = decodeCaCertificates(process.env.DB_SSL_CA)
  return {
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    port: parseInt(process.env.DB_PORT || "5432"),
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    application_name: applicationName,
    ssl:
      process.env.DB_SSL === "true"
        ? { rejectUnauthorized: process.env.DB_SSL_REJECT_UNAUTHORIZED?.trim() !== "false", ...(ca ? { ca } : {}) }
        : undefined,
  }
}

// Lambdas read the RDS credentials from Secrets Manager (DB_SECRET_ARN, which a Lambda deployment sets on every Lambda that
// connects); local development and the containers connect with the DB_* variables
async function createPool(applicationName: string, poolOptions: DbPoolOptions) {
  if (!process.env.DB_SECRET_ARN) {
    return new Pool({ ...envPoolConfig(applicationName), ...poolOptions })
  }

  const secretsClient = new SecretsManagerClient()
  const secretValue = await secretsClient.send(new GetSecretValueCommand({ SecretId: process.env.DB_SECRET_ARN }))
  if (!secretValue.SecretString) {
    throw new Error("Secret not found")
  }

  const secret = JSON.parse(secretValue.SecretString)

  return new Pool({
    host: secret.host,
    user: secret.username,
    port: secret.port,
    password: secret.password,
    database: process.env.DB_NAME,
    application_name: applicationName,
    // Verifies the certificate and that it names `secret.host`. The bundle is parsed once into a context shared by every
    // connection rather than again on each TLS handshake
    ssl: { secureContext: createSecureContext({ ca: readFileSync(LAMBDA_AMAZON_CA_BUNDLE) }) },
    ...poolOptions,
  })
}

// The pool is available as db.$client
export async function createDb(applicationName: string, poolOptions: DbPoolOptions = {}): Promise<DbType> {
  console.log("Creating new database Pool")
  const pool = await createPool(applicationName, poolOptions)

  // An idle client whose connection drops (an RDS restart or failover, often noticed only when a frozen Lambda thaws) is
  // reported on the pool. Unhandled, that `error` event would crash the process; the pool has already discarded the client,
  // so the next query simply opens a new connection.
  pool.on("error", (error) => {
    console.warn("An idle database connection failed:", error.message)
  })

  const db = drizzle(pool, { schema })
  console.log("Database Pool created")

  return db
}

// Checks out every idle client, which opens no connection, and gives each back: those `shouldClose` picks with an error, which
// makes the pool close them. The clients come most recently used first
async function closeIdleConnections(
  pool: Pool,
  releasedAt: WeakMap<PoolClient, number>,
  shouldClose: (lastReleased: number, index: number) => boolean
) {
  const now = Date.now()
  const idle = await Promise.all(Array.from({ length: pool.idleCount }, () => pool.connect()))

  idle.forEach((client, index) => {
    const lastReleased = releasedAt.get(client) ?? now
    client.release(shouldClose(lastReleased, index))
    // Giving it back is not a use
    releasedAt.set(client, lastReleased)
  })
}

// The database of a Lambda serving requests, cached across the invocations of its execution environment. A setup that fails
// is forgotten, so the next request tries again. The setup and the first connection start during init rather than with the
// first request, so the secret fetch and the connection run alongside the rest of the init; a failure there is only logged.
// - getDb, at the start of a request, closes the connections unused for MAX_IDLE_MS, which the network or a database restart
//   may have dropped while the Lambda was frozen.
// - endRequest, once the response is sent, closes all idle connections but the most recent: a frozen Lambda keeps its
//   connections until it is reclaimed, so each container holds one of the small instance's slots rather than up to 4.
// `poolOptions` override the Lambda pool settings, e.g. max: 1 for a Lambda whose queries run one at a time; `connectAtInit:
// false` leaves the setup to the first request needing the database, for a Lambda that often serves requests without it.
export function lambdaDb(
  applicationName: string,
  { poolOptions = {}, connectAtInit = true }: { poolOptions?: DbPoolOptions; connectAtInit?: boolean } = {}
) {
  let dbPromise: Promise<DbType> | undefined
  let pool: Pool | undefined
  const releasedAt = new WeakMap<PoolClient, number>()

  async function getDb() {
    dbPromise ??= createDb(applicationName, { ...LAMBDA_POOL_OPTIONS, ...poolOptions }).then(
      (db) => {
        pool = db.$client
        pool.on("release", (_error, client) => releasedAt.set(client, Date.now()))
        return db
      },
      (error: unknown) => {
        dbPromise = undefined
        throw error
      }
    )

    const db = await dbPromise
    await closeIdleConnections(db.$client, releasedAt, (lastReleased) => Date.now() - lastReleased > MAX_IDLE_MS)

    return db
  }

  async function endRequest() {
    if (pool) {
      await closeIdleConnections(pool, releasedAt, (_lastReleased, index) => index > 0)
    }
  }

  if (connectAtInit) {
    void getDb()
      .then((db) => db.$client.connect())
      .then((client) => client.release())
      .catch((error: unknown) => {
        console.warn("Could not set up the database during init:", error instanceof Error ? error.message : error)
      })
  }

  return { getDb, endRequest }
}
