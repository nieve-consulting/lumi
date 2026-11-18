import { defineConfig } from "drizzle-kit"

import "dotenv/config"

export default defineConfig({
  schema: "./db/schema.ts",
  out: "./db/migrations",
  dialect: "postgresql",
  dbCredentials: {
    host: process.env.DB_HOST || "",
    user: process.env.DB_USER || "",
    port: parseInt(process.env.DB_PORT || "5432"),
    password: process.env.DB_PASSWORD || "",
    database: process.env.DB_NAME || "",
    ssl: true,
  },
})
