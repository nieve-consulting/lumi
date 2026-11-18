import type { DbType } from "@db/db"
import { PgTransaction } from "drizzle-orm/pg-core"
import type { Pool, PoolClient } from "pg"

// A transaction handle. Service queries run on either the database or a transaction
export type Tx = Parameters<Parameters<DbType["transaction"]>[0]>[0]
export type Queryable = DbType | Tx

// Runs `run` in a transaction on one of the pool's connections, for raw SQL outside Drizzle: committed when it resolves, rolled
// back when it throws, or rolled back anyway with `commit: false` (a dry run). A connection that can't even roll back is
// discarded rather than given back to the pool
export async function withTransaction<T>(pool: Pool, run: (client: PoolClient) => Promise<T>, { commit = true } = {}): Promise<T> {
  const client = await pool.connect()
  let broken: Error | undefined
  try {
    await client.query("begin")
    const result = await run(client)
    await client.query(commit ? "commit" : "rollback")
    return result
  } catch (error) {
    await client.query("rollback").catch((rollbackError: Error) => {
      broken = rollbackError
    })
    throw error
  } finally {
    client.release(broken)
  }
}

// Runs independent queries in parallel on the pool, but one after the other in a transaction: a transaction holds a single
// connection, which pg does not let run queries concurrently
export async function concurrently<const T extends readonly (() => Promise<unknown>)[]>(
  db: Queryable,
  tasks: T
): Promise<{ -readonly [K in keyof T]: Awaited<ReturnType<T[K]>> }> {
  if (db instanceof PgTransaction) {
    const results: unknown[] = []
    for (const task of tasks) results.push(await task())
    return results as { -readonly [K in keyof T]: Awaited<ReturnType<T[K]>> }
  }

  return Promise.all(tasks.map((task) => task())) as Promise<{ -readonly [K in keyof T]: Awaited<ReturnType<T[K]>> }>
}
