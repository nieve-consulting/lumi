import { createHash } from "node:crypto"
import { adminSignInFailures } from "@db/schema"
import { and, inArray, lt, sql } from "drizzle-orm"

import type { Queryable } from "./db"
import { ServiceError } from "./errors"

// Throttles password guessing on the admin accounts: at most MAX_FAILURES failed checks per email and per client IP in each
// fixed 15-minute window, counted in Postgres so every Lambda container shares them. A check reserves a failure in each of
// its buckets before the password is verified, in one atomic statement, and a check that succeeds gives it back, so parallel
// guesses can't get past the limit. Buckets hold hashes rather than the email or IP address

export const MAX_FAILURES = 10
const WINDOW_SECONDS = 15 * 60

// Fails a sign-in or a current password check while one of its buckets is throttled. Its message is the same for both
export class AdminSignInThrottledError extends ServiceError {
  constructor(readonly retryAfterSeconds: number) {
    super("rate_limited", "Too many failed sign-in attempts. Try again later.", { retryAfterSeconds })
    this.name = "AdminSignInThrottledError"
  }
}

const digest = (value: string) => createHash("sha256").update(value).digest("base64url")

// The buckets a check counts in: its account's email (normalized) and, for a sign-in, the client's IP address
export function throttleBuckets({ email, clientIp }: { email: string; clientIp?: string | null }) {
  const ip = clientIp?.trim().toLowerCase()
  return [`email:${digest(email)}`, ...(ip ? [`ip:${digest(ip)}`] : [])]
}

const windowStart = sql`to_timestamp(floor(extract(epoch from now()) / ${sql.raw(String(WINDOW_SECONDS))}) * ${sql.raw(String(WINDOW_SECONDS))})`

// The window as Postgres wrote it, so a release matches it exactly whatever the session's time zone
export type ThrottleReservation = { buckets: string[]; windowStart: string }

// Counts a failure in every bucket ahead of the check. Throws an AdminSignInThrottledError, without checking the password,
// once any bucket is over the limit
export async function reserveFailure(db: Queryable, buckets: string[]): Promise<ThrottleReservation> {
  const rows = await db
    .insert(adminSignInFailures)
    .values(buckets.map((bucket) => ({ bucket, window_start: windowStart, count: 1 })))
    .onConflictDoUpdate({
      target: [adminSignInFailures.bucket, adminSignInFailures.window_start],
      set: { count: sql`${adminSignInFailures.count} + 1` },
    })
    .returning({ count: adminSignInFailures.count, windowStart: sql<string>`${adminSignInFailures.window_start}::text` })

  // Old windows are cleared now and then rather than on every check. Awaited, since a Lambda freezes once it has answered
  if (Math.random() < 0.05) {
    await db
      .delete(adminSignInFailures)
      .where(lt(adminSignInFailures.window_start, sql`now() - interval '1 hour'`))
      .catch((error) => console.warn("Could not clear old admin sign-in failure windows", error))
  }

  if (rows.some(({ count }) => count > MAX_FAILURES)) {
    const elapsed = Math.floor(Date.now() / 1000) % WINDOW_SECONDS
    throw new AdminSignInThrottledError(WINDOW_SECONDS - elapsed)
  }

  return { buckets, windowStart: rows[0].windowStart }
}

// Gives back the failure a successful check reserved
export async function releaseFailure(db: Queryable, { buckets, windowStart: start }: ThrottleReservation) {
  await db
    .update(adminSignInFailures)
    .set({ count: sql`greatest(${adminSignInFailures.count} - 1, 0)` })
    .where(and(inArray(adminSignInFailures.bucket, buckets), sql`${adminSignInFailures.window_start} = ${start}::timestamp`))
}

// Forgets an account's failures, once an operator has reset its password (the admin:reset script)
export async function clearFailures(db: Queryable, buckets: string[]) {
  await db.delete(adminSignInFailures).where(inArray(adminSignInFailures.bucket, buckets))
}
