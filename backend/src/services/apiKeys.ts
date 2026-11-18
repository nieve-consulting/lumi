import { createHash, randomBytes } from "node:crypto"
import { apiKeys } from "@db/schema"
import { and, desc, eq, isNull, lt, or } from "drizzle-orm"

import type { Queryable } from "./db"
import { ServiceError } from "./errors"

// API keys admins generate for other systems, such as a website (db/schema.ts apiKeys). The installation's own key
// (LUMI_API_KEY, src/authorizers/apikey.ts) is not one of them. A secret is returned once, when the key is created; only its
// SHA-256 hash is stored, which requests are matched by (src/authorizers/roles.ts). What each access may do is enforced in
// src/apollo/access.ts

export type ApiKeyAccess = (typeof apiKeys.access.enumValues)[number]

// A key as the API returns it: everything but its secret's hash
const keyColumns = {
  id: apiKeys.id,
  name: apiKeys.name,
  access: apiKeys.access,
  last_characters: apiKeys.last_characters,
  created_by: apiKeys.created_by,
  created_at: apiKeys.created_at,
  last_used_at: apiKeys.last_used_at,
}

export type ApiKeyRecord = Omit<typeof apiKeys.$inferSelect, "secret_hash" | "revoked_at">

// A problem with an input, by its field, for a form to show next to it
export type ApiKeyProblem = { field: string; message: string }

export class ApiKeyInputError extends ServiceError {
  constructor(readonly problems: ApiKeyProblem[]) {
    super("invalid_input", `Invalid API key:\n${problems.map(({ field, message }) => `- ${field}: ${message}`).join("\n")}`)
    this.name = "ApiKeyInputError"
  }
}

export class ApiKeyNotFoundError extends ServiceError {
  constructor() {
    super("not_found", "No active API key was found. It may have been revoked already.")
    this.name = "ApiKeyNotFoundError"
  }
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

// Recognisable in code and by secret scanners
const SECRET_PREFIX = "lumi_"

// The prefix and 32 random bytes in base64url (43 characters)
const SECRET_PATTERN = /^lumi_[A-Za-z0-9_-]{43}$/

const MAX_NAME_LENGTH = 100

// Longest email address
const MAX_CREATED_BY_LENGTH = 320

// "Last used" is written at most this often per key, so a busy key doesn't write on every request
const LAST_USED_INTERVAL_MS = 60_000

const hashSecret = (secret: string) => createHash("sha256").update(secret).digest("hex")

// Whether the token has the shape of a generated key, so other tokens are refused without a query
export const looksLikeApiKey = (token: string) => SECRET_PATTERN.test(token)

// Characters (code points), not UTF-16 units
const characterCount = (value: string) => Array.from(value).length

// Every active key, the newest first
export function listApiKeys(db: Queryable): Promise<ApiKeyRecord[]> {
  return db.select(keyColumns).from(apiKeys).where(isNull(apiKeys.revoked_at)).orderBy(desc(apiKeys.created_at), desc(apiKeys.id))
}

// Generates a key, returned with its secret, which is never available again. Throws an ApiKeyInputError
export async function createApiKey(
  db: Queryable,
  input: { name: string; access: ApiKeyAccess; createdBy?: string | null }
): Promise<{ apiKey: ApiKeyRecord; secret: string }> {
  const problems: ApiKeyProblem[] = []
  const name = input.name.trim()
  if (!name) problems.push({ field: "name", message: "Enter a name" })
  else if (characterCount(name) > MAX_NAME_LENGTH) problems.push({ field: "name", message: `Use at most ${MAX_NAME_LENGTH} characters` })
  const createdBy = input.createdBy?.trim() || null
  if (createdBy && characterCount(createdBy) > MAX_CREATED_BY_LENGTH) {
    problems.push({ field: "createdBy", message: `Use at most ${MAX_CREATED_BY_LENGTH} characters` })
  }
  if (problems.length) throw new ApiKeyInputError(problems)

  const secret = `${SECRET_PREFIX}${randomBytes(32).toString("base64url")}`
  const [apiKey] = await db
    .insert(apiKeys)
    // Dated by this clock, like its last use (findActiveApiKey): the column has no time zone
    .values({
      name,
      access: input.access,
      secret_hash: hashSecret(secret),
      last_characters: secret.slice(-4),
      created_by: createdBy,
      created_at: new Date(),
    })
    .returning(keyColumns)

  return { apiKey, secret }
}

// Revokes an active key: it is refused from then on, and leaves the list. Throws an ApiKeyNotFoundError when there is no such
// key or it was revoked already
export async function revokeApiKey(db: Queryable, id: string): Promise<void> {
  if (!UUID.test(id)) throw new ApiKeyNotFoundError()

  const [revoked] = await db
    .update(apiKeys)
    .set({ revoked_at: new Date() })
    .where(and(eq(apiKeys.id, id), isNull(apiKeys.revoked_at)))
    .returning({ id: apiKeys.id })
  if (!revoked) throw new ApiKeyNotFoundError()
}

// The active key whose secret the token is, or null. Callers check the token's shape first (looksLikeApiKey), which spares
// them the query. Records its use when the last one recorded is null or older than LAST_USED_INTERVAL_MS, so most lookups
// only read; failing to record it is only logged, never fails the request
export async function findActiveApiKey(db: Queryable, token: string): Promise<{ id: string; access: ApiKeyAccess } | null> {
  const [key] = await db
    .select({ id: apiKeys.id, access: apiKeys.access, last_used_at: apiKeys.last_used_at })
    .from(apiKeys)
    .where(and(eq(apiKeys.secret_hash, hashSecret(token)), isNull(apiKeys.revoked_at)))
  if (!key) return null

  const now = new Date()
  const staleBefore = new Date(now.getTime() - LAST_USED_INTERVAL_MS)
  if (!key.last_used_at || key.last_used_at < staleBefore) {
    try {
      // Guarded again, so concurrent requests that all read a stale time write it only once
      await db
        .update(apiKeys)
        .set({ last_used_at: now })
        .where(and(eq(apiKeys.id, key.id), or(isNull(apiKeys.last_used_at), lt(apiKeys.last_used_at, staleBefore))))
    } catch (error) {
      console.warn(`Could not record the use of API key ${key.id}:`, error instanceof Error ? error.message : error)
    }
  }

  return { id: key.id, access: key.access }
}
