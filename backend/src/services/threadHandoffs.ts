import type { Pool } from "pg"

// A conversation's handoff (booking a meeting, sending an enquiry) holds this advisory lock (with the hash of the thread's
// id) while it runs, so two requests for one thread never both act on it: a booking and an enquiry from the same card, or
// enquiries from two tabs, would otherwise both see the thread open and both book or send before either closes it. The
// second waits, then finds the thread closed
const THREAD_HANDOFF_LOCK = 2_160_002

// How long a request waits for another handoff of its thread: more than one usually takes (a webhook times out after 10 s),
// less than the gateway waits for the answer
const WAIT_MS = 20_000
const POLL_MS = 250

// Runs the handoff holding the thread's lock and returns its result, or undefined without running it when another handoff
// of the thread still held the lock after WAIT_MS. The lock lives in a connection held for the handoff and closed after it,
// which releases it however the handoff ended
export async function withThreadHandoffLock<T>(pool: Pool, threadId: string, handoff: () => Promise<T>): Promise<T | undefined> {
  const lockClient = await pool.connect()

  try {
    const deadline = Date.now() + WAIT_MS
    for (;;) {
      const { rows } = await lockClient.query<{ locked: boolean }>("select pg_try_advisory_lock($1, hashtext($2)) as locked", [
        THREAD_HANDOFF_LOCK,
        threadId.toLowerCase(),
      ])
      if (rows[0]?.locked) break
      if (Date.now() >= deadline) return undefined
      await new Promise((resolve) => setTimeout(resolve, POLL_MS))
    }

    return await handoff()
  } finally {
    lockClient.release(true)
  }
}
