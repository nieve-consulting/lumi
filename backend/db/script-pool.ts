import path from "node:path"
import process from "node:process"
import { GetSecretValueCommand, SecretsManagerClient } from "@aws-sdk/client-secrets-manager"
import dotenv from "dotenv"
import { Pool } from "pg"

import { MIGRATION_POOL_OPTIONS } from "./migrator"

// The pool of the db/migrate*.ts scripts and the admin:reset script, configured by the .env file in db/ named by envPath: by
// default the first CLI argument (e.g. `tsx db/migrate.ts .env.local`), else `.env`
export async function createScriptPool(applicationName: string, envPath = process.argv[2] || ".env"): Promise<Pool> {
  const result = dotenv.config({ path: path.resolve(process.cwd(), "db", envPath) })
  if (result.error) {
    throw new Error(`Could not load db/${envPath}: ${result.error.message}`)
  }

  const { DB_HOST, DB_USER, DB_PORT, DB_PASSWORD, DB_NAME, DB_SSL, ENVIRONMENT = "development", DB_SECRET_ARN } = process.env

  if (ENVIRONMENT === "development") {
    if (!DB_HOST || !DB_USER || !DB_PASSWORD || !DB_NAME) {
      throw new Error("Missing required database environment variables.")
    }

    return new Pool({
      host: DB_HOST,
      user: DB_USER,
      port: parseInt(DB_PORT || "5432"),
      password: DB_PASSWORD,
      database: DB_NAME,
      application_name: applicationName,
      ssl: DB_SSL === "true" ? { rejectUnauthorized: false } : undefined,
      ...MIGRATION_POOL_OPTIONS,
    })
  }

  // A deployed database is reached through a tunnel listening on localhost:5433, with the credentials of the Secrets Manager
  // secret DB_SECRET_ARN names (backend/db/README.md)
  if (!DB_SECRET_ARN) {
    throw new Error("Missing DB_SECRET_ARN: set it to the ARN of the database's Secrets Manager secret.")
  }

  const secretsClient = new SecretsManagerClient()
  const secretValue = await secretsClient.send(new GetSecretValueCommand({ SecretId: DB_SECRET_ARN }))
  if (!secretValue.SecretString) {
    throw new Error("Secret not found")
  }

  const secret = JSON.parse(secretValue.SecretString)

  return new Pool({
    host: "127.0.0.1",
    user: secret.username,
    port: 5433,
    password: secret.password,
    database: DB_NAME,
    application_name: applicationName,
    ssl: { rejectUnauthorized: false },
    ...MIGRATION_POOL_OPTIONS,
  })
}
