import type { DbType } from "@db/db"
import { mcpRateLimits } from "@db/schema"
import { and, eq, lt, sql } from "drizzle-orm"

// Fixed windows per caller, counted in Postgres so every Lambda container and server process shares them. The MCP server and
// the public agents routes count in the same table (mcp_rate_limits) under buckets of their own

// The caller's address, set by each entry from the connection (or the reverse proxy in front of the container) after removing
// any copy the client sent, never taken from the client
export const SOURCE_IP_HEADER = "x-lumi-source-ip"

// The start of the current window of windowSeconds, aligned to the epoch so every process agrees on it (a minute window starts
// on the minute, as date_trunc('minute', now()) did)
function windowStartOf(windowSeconds: number) {
  const seconds = sql.raw(String(Math.trunc(windowSeconds)))
  return sql`to_timestamp(floor(extract(epoch from now()) / ${seconds}) * ${seconds})`
}

// Seconds until the current window of windowSeconds ends, by this process's clock
const secondsLeftIn = (windowSeconds: number) => windowSeconds - (Math.floor(Date.now() / 1000) % windowSeconds)

// Counts a request against the bucket's limit in the current window of windowSeconds (a minute by default)
export async function consumeRateLimit(db: DbType, bucket: string, limit: number, windowSeconds = 60) {
  const [{ count }] = await db
    .insert(mcpRateLimits)
    .values({ bucket, window_start: windowStartOf(windowSeconds), count: 1 })
    .onConflictDoUpdate({ target: [mcpRateLimits.bucket, mcpRateLimits.window_start], set: { count: sql`${mcpRateLimits.count} + 1` } })
    .returning({ count: mcpRateLimits.count })

  // Old windows are cleared now and then rather than on every request, keeping a day of them: longer than the longest window
  // counted (an hour). Awaited, since a Lambda freezes once it has answered
  if (Math.random() < 0.01) {
    await db
      .delete(mcpRateLimits)
      .where(lt(mcpRateLimits.window_start, sql`now() - interval '1 day'`))
      .catch((error) => console.warn("Could not clear old rate limit windows", error))
  }

  return { allowed: count <= limit, retryAfterSeconds: secondsLeftIn(windowSeconds) }
}

// Whether the bucket still has room in the current window without counting a request, for routes that only count the requests
// that get through their own checks but want to refuse early once the window is used up
export async function peekRateLimit(db: DbType, bucket: string, limit: number, windowSeconds = 60) {
  const [window] = await db
    .select({ count: mcpRateLimits.count })
    .from(mcpRateLimits)
    .where(and(eq(mcpRateLimits.bucket, bucket), eq(mcpRateLimits.window_start, windowStartOf(windowSeconds))))

  return { allowed: (window?.count ?? 0) < limit, retryAfterSeconds: secondsLeftIn(windowSeconds) }
}
