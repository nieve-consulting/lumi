import type { ApiAccess } from "@/authorizers/apiAccess"
import { consumeRateLimit } from "@/services/rateLimit"
import type { DbType } from "@db/db"

// Each generated key's GraphQL rate limit, counted by the transports (the Apollo Lambda, src/apollo/lambda/apollo.ts, and the
// container api, src/container/api.ts) before Apollo sees the request, so every request counts: one Apollo refuses before any
// plugin runs, such as one that doesn't parse or validate, as much as one it runs. The installation's own key has no limit

// Requests each generated key may make per minute, counted in Postgres across every Lambda and process. A website build may
// query many pages at once: 3000 a minute is the 50 requests a second the API Gateway's route throttle allowed, now per key
export const API_KEY_REQUESTS_PER_MINUTE = 3000

export type ApiKeyLimitRefusal = { status: 429; headers: Record<string, string>; body: string }

// Counts the request of a generated key, and answers how to refuse it once the key is past its limit: a GraphQL error with
// the RATE_LIMITED code and retryAfterSeconds, as the API's other refusals. Null to go on, as for the installation's own key,
// which never connects to the database here
export async function consumeApiKeyLimit(access: ApiAccess, getDb: () => Promise<DbType>): Promise<ApiKeyLimitRefusal | null> {
  if (!access.apiKeyId) return null

  const { allowed, retryAfterSeconds } = await consumeRateLimit(await getDb(), `api-key:${access.apiKeyId}`, API_KEY_REQUESTS_PER_MINUTE)
  if (allowed) return null

  return {
    status: 429,
    headers: { "Content-Type": "application/json", "Retry-After": String(retryAfterSeconds) },
    body: JSON.stringify({
      errors: [
        { message: "This API key made too many requests. Wait a minute and try again.", extensions: { code: "RATE_LIMITED", retryAfterSeconds } },
      ],
    }),
  }
}
