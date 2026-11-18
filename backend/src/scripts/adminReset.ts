import process from "node:process"
import { createScriptPool } from "@db/script-pool"

import { runAdminReset } from "./adminResetCommand"

// Gives an admin a temporary password (adminResetCommand.ts). Connects like db:migrate (db/script-pool.ts), with the db/ .env
// file --env names
//
//   pnpm admin:reset <email> [--name "Name"] [--env .env.production.local]

const USAGE = `Usage: pnpm admin:reset <email> [--name "Name"] [--env <file in db/, default .env>]

Creates the admin account with this email, or resets its password, to a temporary password printed once.`

runAdminReset({
  args: process.argv.slice(2),
  usage: USAGE,
  envOption: true,
  connect: (envPath) => createScriptPool("lumi-admin-reset", envPath ?? ".env"),
}).then((code) => process.exit(code))
