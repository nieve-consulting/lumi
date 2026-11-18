import { parseArgs } from "node:util"
import { AdminAccountInputError, resetAdminAccount } from "@/services/adminAccounts"
import { pgError } from "@/services/errors"
import * as schema from "@db/schema"
import { adminEmailSchema, adminNameSchema } from "@lumi/shared-contracts/adminAccounts"
import { drizzle } from "drizzle-orm/node-postgres"
import type { Pool } from "pg"

// Operator recovery for an installation signing admins in with an email and password (ADMIN_AUTH_PROVIDER=local): gives the
// admin with this email a temporary password, creating the account if there is none, and prints it once. The admin signs in
// with it and must choose a new password first. Also how an installation already set up gets its first admin when it moves
// to local sign-in. It never migrates. Run by `pnpm admin:reset` (adminReset.ts), connecting with a db/ .env file, and by the
// container's admin-reset command (src/container), connecting with the DB_* variables

interface AdminResetCommand {
  // The command line's arguments, after the command itself
  args: string[]
  usage: string
  // Whether the command takes --env <file in db/>, which `connect` receives
  envOption: boolean
  // Fails with a message for the operator
  connect: (envPath: string | undefined) => Promise<Pool>
}

// Resolves to the exit code: 0 once the password is printed, 2 for invalid arguments, 1 for any other failure
export async function runAdminReset({ args, usage, envOption, connect }: AdminResetCommand): Promise<number> {
  let input: { email: string; name: string | undefined; envPath: string | undefined }
  try {
    const { values, positionals } = parseArgs({
      args,
      allowPositionals: true,
      options: {
        name: { type: "string" },
        help: { type: "boolean", short: "h" },
        ...(envOption ? { env: { type: "string" as const } } : {}),
      },
    })
    if (values.help) {
      console.log(usage)
      return 0
    }
    if (positionals.length !== 1) throw new Error(positionals.length ? "Give a single email address." : "Give the admin's email address.")
    // Checked before connecting, and again by resetAdminAccount
    const email = adminEmailSchema.safeParse(positionals[0])
    const name = adminNameSchema.safeParse(values.name)
    const problems = [
      ...(email.error?.issues.map(({ message }) => `Email: ${message}`) ?? []),
      ...(name.error?.issues.map(({ message }) => `Name: ${message}`) ?? []),
    ]
    if (!email.success || !name.success) throw new Error(problems.join("\n"))
    input = { email: email.data, name: name.data, envPath: "env" in values ? (values.env as string | undefined) : undefined }
  } catch (error) {
    console.error(`${(error as Error).message}\n\n${usage}`)
    return 2
  }

  try {
    const pool = await connect(input.envPath)

    try {
      const { account, created, temporaryPassword } = await resetAdminAccount(drizzle(pool, { schema }), { email: input.email, name: input.name })
      console.log(created ? `Created the admin account ${account.email}.` : `Reset the password of the admin account ${account.email}.`)
      // The only place a password is ever printed: the operator passes it on, and it is stored only hashed
      console.log(`\nTemporary password (shown once): ${temporaryPassword}\n`)
      console.log("Sign in with it in the admin: you will be asked to choose a new password before anything else.")
      return 0
    } finally {
      await pool.end()
    }
  } catch (error) {
    if (error instanceof AdminAccountInputError) {
      console.error(error.problems.map(({ field, message }) => `${field}: ${message}`).join("\n"))
      return 2
    }
    // A missing admin_accounts table (42P01) means the migrations haven't run on this database
    console.error(
      pgError(error)?.code === "42P01"
        ? "The admin_accounts table doesn't exist: apply the database migrations first."
        : `Could not reset the admin account: ${(error as Error).message}`
    )
    return 1
  }
}
