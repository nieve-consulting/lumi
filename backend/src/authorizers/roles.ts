import { findActiveApiKey, looksLikeApiKey } from "@/services/apiKeys"
import type { DbType } from "@db/db"

import type { ApiAccess } from "./apiAccess"
import { isApiKey } from "./apikey"

// Resolves the access of a GraphQL API request's key (apiAccess.ts says what each role may do). The agents API's /admin routes
// and the worker only take the internal key (isApiKey)

// The token's access, or null when it is no key at all (or a revoked one). The internal key is checked first and needs no
// database, so the web app keeps working while the database can't be reached; only a token shaped like a generated key is
// looked up, so other tokens never connect to the database. A failing lookup throws
export async function resolveApiAccess(token: string | null | undefined, getDb: () => Promise<DbType>): Promise<ApiAccess | null> {
  if (!token) return null
  if (await isApiKey(token)) return { role: "internal" }
  if (!looksLikeApiKey(token)) return null

  const key = await findActiveApiKey(await getDb(), token)
  if (!key) return null
  return { role: key.access === "admin" ? "admin" : "readOnly", apiKeyId: key.id }
}
