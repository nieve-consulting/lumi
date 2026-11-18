import { adminAccounts } from "@db/schema"
import {
  adminEmailSchema,
  adminNameSchema,
  adminPasswordSchema,
  exceedsAdminPasswordLength,
  MAX_ADMIN_PASSWORD_LENGTH,
  normalizeAdminEmail,
} from "@lumi/shared-contracts/adminAccounts"
import { and, asc, count, eq, sql } from "drizzle-orm"
import type { z } from "zod"

import { clearFailures, releaseFailure, reserveFailure, throttleBuckets } from "./adminSignInThrottle"
import { concurrently, type Queryable, type Tx } from "./db"
import { pgError, ServiceError } from "./errors"
import { generateTemporaryPassword, hashPassword, needsRehash, verifyDummyPassword, verifyPassword } from "./passwords"

// The email and password admin accounts of an installation whose web app signs admins in itself (ADMIN_AUTH_PROVIDER=local)
// rather than with Google Workspace. The setup wizard creates the first one (setupBusiness in businessSettings.ts), admins
// add and remove the others, and the admin:reset script (src/scripts/adminReset.ts) recovers access. The web app checks
// admin access before calling anything but the setup and the sign-in. Passwords and their hashes never leave this module
// and its password helpers, and are never logged: the queries writing a hash fail with errors that leave its parameters out

// An account as the API returns it: everything but its password hash
const accountColumns = {
  id: adminAccounts.id,
  email: adminAccounts.email,
  name: adminAccounts.name,
  must_change_password: adminAccounts.must_change_password,
  created_at: adminAccounts.created_at,
  last_sign_in_at: adminAccounts.last_sign_in_at,
  password_changed_at: adminAccounts.password_changed_at,
}

export type AdminAccountRecord = Omit<typeof adminAccounts.$inferSelect, "password_hash" | "updated_at">

// A problem with an input, by its field ("email", "firstAdmin.password"), for a form to show next to it
export type AdminAccountProblem = { field: string; message: string }

export class AdminAccountInputError extends ServiceError {
  constructor(readonly problems: AdminAccountProblem[]) {
    super("invalid_input", `Invalid admin account:\n${problems.map(({ field, message }) => `- ${field}: ${message}`).join("\n")}`)
    this.name = "AdminAccountInputError"
  }
}

export class AdminAccountExistsError extends ServiceError {
  constructor(message = "An admin account with this email already exists.") {
    super("conflict", message)
    this.name = "AdminAccountExistsError"
  }
}

export class AdminAccountNotFoundError extends ServiceError {
  constructor() {
    super("not_found", "No admin account was found. It may have been removed.")
    this.name = "AdminAccountNotFoundError"
  }
}

// The installation always keeps an admin who can sign in
export class LastAdminAccountError extends ServiceError {
  constructor() {
    super("conflict", "This is the only admin account. Add another admin before removing it.")
    this.name = "LastAdminAccountError"
  }
}

export class InvalidAdminCredentialsError extends ServiceError {
  constructor() {
    super("unauthenticated", "The current password is wrong.")
    this.name = "InvalidAdminCredentialsError"
  }
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

// Any fixed key, other than the migrations' (db/migrator.ts): taken by the writes that must see every account or may run
// before any admin exists (the setup's first admin, the admin:reset script, removals), so a first admin is only created when
// there is none and the last one is never removed
const ADMIN_ACCOUNTS_LOCK_KEY = 74_201_902

async function lockAdminAccounts(tx: Tx) {
  await tx.execute(sql`select pg_advisory_xact_lock(${ADMIN_ACCOUNTS_LOCK_KEY})`)
}

// The first characters (code points) of a string, without splitting all of it
function firstCharacters(value: string, count: number) {
  let end = 0
  for (let taken = 0; taken < count && end < value.length; taken++) end += value.codePointAt(end)! > 0xffff ? 2 : 1
  return value.slice(0, end)
}

// Whether the password matches the hash, or for no hash (an unknown email) a dummy check taking as long. A password longer
// than the policy allows never matches, but is still checked, cut to the longest allowed, so it takes as long without
// hashing all of it
async function passwordMatches(password: string, hash: string | undefined): Promise<boolean> {
  const tooLong = exceedsAdminPasswordLength(password)
  const candidate = tooLong ? firstCharacters(password, MAX_ADMIN_PASSWORD_LENGTH) : password
  const matches = hash ? await verifyPassword(candidate, hash) : await verifyDummyPassword(candidate)
  return matches && !tooLong
}

// Checks one field, its problems listed under its name
function check<S extends z.ZodType>(schema: S, value: unknown, field: string, problems: AdminAccountProblem[]): z.output<S> | undefined {
  const result = schema.safeParse(value)
  if (result.success) return result.data
  problems.push(...result.error.issues.map(({ path, message }) => ({ field: [field, ...path.map(String)].join("."), message })))
}

// The email and optional name of a new account, normalized. Problems are listed under the fields with the prefix, e.g.
// firstAdmin.email
export function parseNewAdmin(input: { email: string; name?: string | null }, problems: AdminAccountProblem[], prefix = "") {
  const email = check(adminEmailSchema, input.email, `${prefix}email`, problems)
  const name = check(adminNameSchema, input.name, `${prefix}name`, problems)
  return { email: email ?? "", name: name ?? null }
}

export function parsePassword(password: string, field: string, problems: AdminAccountProblem[]) {
  check(adminPasswordSchema, password, field, problems)
}

// The installation's first admin as the setup wizard enters it, normalized, with its problems under firstAdmin.email,
// firstAdmin.name and firstAdmin.password
export function parseFirstAdmin(input: { email: string; name?: string | null; password: string }) {
  const problems: AdminAccountProblem[] = []
  const admin = parseNewAdmin(input, problems, "firstAdmin.")
  parsePassword(input.password, "firstAdmin.password", problems)
  return { ...admin, problems }
}

// Database errors of the queries writing a hash carry it in their parameters: they are rethrown without them. A taken email
// is an AdminAccountExistsError
function withoutParameters(error: unknown): never {
  if (error instanceof ServiceError) throw error

  const pg = pgError(error)
  if (pg?.code === "23505") throw new AdminAccountExistsError()
  throw new Error(`Could not save the admin account${pg?.code ? ` (Postgres error ${pg.code})` : ""}`)
}

export async function hasAdminAccounts(db: Queryable): Promise<boolean> {
  const [account] = await db.select({ id: adminAccounts.id }).from(adminAccounts).limit(1)
  return Boolean(account)
}

// Every account, the oldest first
export function listAdminAccounts(db: Queryable): Promise<AdminAccountRecord[]> {
  return db.select(accountColumns).from(adminAccounts).orderBy(asc(adminAccounts.created_at), asc(adminAccounts.email))
}

// The account, or null when there is none with this id (removed, or not an id at all)
export async function getAdminAccount(db: Queryable, id: string): Promise<AdminAccountRecord | null> {
  if (!UUID.test(id)) return null
  const [account] = await db.select(accountColumns).from(adminAccounts).where(eq(adminAccounts.id, id))
  return account ?? null
}

// Creates the installation's first admin in the setup's transaction, with a password the operator chose. Throws an
// AdminAccountExistsError when any account exists already, which rolls the whole setup back
export async function insertFirstAdmin(tx: Tx, admin: { email: string; name: string | null; passwordHash: string }): Promise<void> {
  await lockAdminAccounts(tx)
  const [{ total }] = await tx.select({ total: count() }).from(adminAccounts)
  if (total > 0) throw new AdminAccountExistsError("This installation already has an admin account. Sign in with it instead.")

  await tx
    .insert(adminAccounts)
    // password_changed_at from this clock, not the column's now(): the column has no time zone, so the database's now() is in
    // its session TimeZone, while sign-in times are written from here (the MCP server compares them, src/mcp/oauth/team.ts)
    .values({ email: admin.email, name: admin.name, password_hash: admin.passwordHash, password_changed_at: new Date() })
    .catch(withoutParameters)
}

// Adds an admin with a generated temporary password, returned once for the admin who added it to pass on: it is only stored
// hashed. Throws an AdminAccountInputError or, for a taken email, an AdminAccountExistsError
export async function createAdminAccount(
  db: Queryable,
  input: { email: string; name?: string | null }
): Promise<{ account: AdminAccountRecord; temporaryPassword: string }> {
  const problems: AdminAccountProblem[] = []
  const { email, name } = parseNewAdmin(input, problems)
  if (problems.length) throw new AdminAccountInputError(problems)

  const temporaryPassword = generateTemporaryPassword()
  const [account] = await db
    .insert(adminAccounts)
    // Dated by this clock, like the setup's first admin (insertFirstAdmin)
    .values({ email, name, password_hash: await hashPassword(temporaryPassword), must_change_password: true, password_changed_at: new Date() })
    .returning(accountColumns)
    .catch(withoutParameters)

  return { account, temporaryPassword }
}

// Removes an account unless it is the last one. Concurrent removals run one after the other, so two admins removing each
// other can't leave none. Throws an AdminAccountNotFoundError or a LastAdminAccountError
export async function deleteAdminAccount(db: Queryable, id: string): Promise<void> {
  if (!UUID.test(id)) throw new AdminAccountNotFoundError()

  await db.transaction(async (tx) => {
    await lockAdminAccounts(tx)
    const [account] = await tx.select({ id: adminAccounts.id }).from(adminAccounts).where(eq(adminAccounts.id, id))
    if (!account) throw new AdminAccountNotFoundError()
    const [{ total }] = await tx.select({ total: count() }).from(adminAccounts)
    if (total <= 1) throw new LastAdminAccountError()

    await tx.delete(adminAccounts).where(eq(adminAccounts.id, id))
  })
}

// The account whose email and password these are, or null for a wrong password or an unknown email, which take the same
// time: an unknown email checks the password against a dummy hash. Throws an AdminSignInThrottledError, without checking
// the password, once the email or the client IP has had too many failures. Records the sign-in, and upgrades a hash made
// with older parameters
export async function verifyAdminCredentials(
  db: Queryable,
  { email, password, clientIp }: { email: string; password: string; clientIp?: string | null }
): Promise<AdminAccountRecord | null> {
  const normalized = normalizeAdminEmail(email)
  const validEmail = adminEmailSchema.safeParse(normalized).success
  // Independent: a throttled check fails with the reservation, whatever the lookup found
  const [reservation, [account]] = await concurrently(db, [
    () => reserveFailure(db, throttleBuckets({ email: normalized, clientIp })),
    async () =>
      validEmail
        ? await db.select({ id: adminAccounts.id, hash: adminAccounts.password_hash }).from(adminAccounts).where(eq(adminAccounts.email, normalized))
        : [],
  ])

  if (!(await passwordMatches(password, account?.hash)) || !account) return null

  const rehash = needsRehash(account.hash) ? { password_hash: await hashPassword(password) } : {}
  // Only while the hash is still the one just verified: a password changed or reset meanwhile (or the account removed) fails
  // the sign-in, so the old password can't get a session with the new password stamp nor write its hash back
  const [signedIn] = await db
    .update(adminAccounts)
    .set({ last_sign_in_at: new Date(), ...rehash })
    .where(and(eq(adminAccounts.id, account.id), eq(adminAccounts.password_hash, account.hash)))
    .returning(accountColumns)
    .catch(withoutParameters)
  if (!signedIn) return null

  await releaseFailure(db, reservation)
  return signedIn
}

// Replaces an admin's password once its current one is checked, ending a temporary password. Wrong current passwords count
// as failed sign-ins of the account's email. Throws an AdminAccountInputError (the new password breaks the policy or is the
// current one), an AdminAccountNotFoundError, an InvalidAdminCredentialsError or an AdminSignInThrottledError
export async function changeAdminPassword(
  db: Queryable,
  { id, currentPassword, newPassword }: { id: string; currentPassword: string; newPassword: string }
): Promise<AdminAccountRecord> {
  const problems: AdminAccountProblem[] = []
  parsePassword(newPassword, "newPassword", problems)
  if (problems.length) throw new AdminAccountInputError(problems)

  if (!UUID.test(id)) throw new AdminAccountNotFoundError()
  const [account] = await db
    .select({ email: adminAccounts.email, hash: adminAccounts.password_hash })
    .from(adminAccounts)
    .where(eq(adminAccounts.id, id))
  if (!account) throw new AdminAccountNotFoundError()

  const reservation = await reserveFailure(db, throttleBuckets({ email: account.email }))
  if (!(await passwordMatches(currentPassword, account.hash))) throw new InvalidAdminCredentialsError()
  await releaseFailure(db, reservation)

  // Compared as they are hashed
  if (newPassword.normalize("NFC") === currentPassword.normalize("NFC")) {
    throw new AdminAccountInputError([{ field: "newPassword", message: "Choose a password other than your current one" }])
  }

  const [updated] = await db
    .update(adminAccounts)
    // A new password_changed_at ends the account's other sessions (the web app compares it with the session's)
    .set({ password_hash: await hashPassword(newPassword), must_change_password: false, password_changed_at: new Date() })
    // Only while the hash is still the one just verified, so a reset or another change made meanwhile isn't overwritten
    .where(and(eq(adminAccounts.id, id), eq(adminAccounts.password_hash, account.hash)))
    .returning(accountColumns)
    .catch(withoutParameters)
  if (!updated) {
    // Removed meanwhile, or its password changed so the one given is no longer the current one
    const [exists] = await db.select({ id: adminAccounts.id }).from(adminAccounts).where(eq(adminAccounts.id, id))
    throw exists ? new InvalidAdminCredentialsError() : new AdminAccountNotFoundError()
  }

  return updated
}

// Operator recovery (the admin:reset script): gives the account with this email a new temporary password, or creates it with
// one when there is none, and forgets the email's failed sign-ins. A name given replaces the account's. Throws an
// AdminAccountInputError
export async function resetAdminAccount(
  db: Queryable,
  input: { email: string; name?: string | null }
): Promise<{ account: AdminAccountRecord; created: boolean; temporaryPassword: string }> {
  const problems: AdminAccountProblem[] = []
  const { email, name } = parseNewAdmin(input, problems)
  if (problems.length) throw new AdminAccountInputError(problems)

  const temporaryPassword = generateTemporaryPassword()
  const passwordHash = await hashPassword(temporaryPassword)

  const result = await db.transaction(async (tx) => {
    // Like the setup's first admin, which may be created meanwhile
    await lockAdminAccounts(tx)
    const [existing] = await tx.select({ id: adminAccounts.id }).from(adminAccounts).where(eq(adminAccounts.email, email))
    if (existing) {
      const [account] = await tx
        .update(adminAccounts)
        // Ends the account's sessions, like a password change
        .set({ password_hash: passwordHash, must_change_password: true, password_changed_at: new Date(), ...(name && { name }) })
        .where(eq(adminAccounts.id, existing.id))
        .returning(accountColumns)
        .catch(withoutParameters)
      return { account, created: false }
    }

    const [account] = await tx
      .insert(adminAccounts)
      .values({ email, name, password_hash: passwordHash, must_change_password: true, password_changed_at: new Date() })
      .returning(accountColumns)
      .catch(withoutParameters)
    return { account, created: true }
  })

  await clearFailures(db, throttleBuckets({ email }))
  return { ...result, temporaryPassword }
}
