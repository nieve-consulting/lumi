import { drizzle } from "drizzle-orm/node-postgres"
import { Pool } from "pg"

import * as schema from "./schema"

const pool = new Pool({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  port: parseInt(process.env.DB_PORT || "5432"),
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  application_name: "lumi-api",
  ssl:
    process.env.DB_SSL === "true"
      ? {
          rejectUnauthorized: false,
        }
      : undefined,
})

const db = drizzle(pool, { schema })

type DbType = typeof db

export { db, pool, DbType }
