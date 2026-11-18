import { createHash } from "node:crypto"
import { mcpAuditEvents, mcpIdempotencyKeys } from "@db/schema"
import { and, eq } from "drizzle-orm"
import { z } from "zod"

import { requireTeam, type Actor, type ServiceContext } from "./context"
import type { Tx } from "./db"
import { conflict, ServiceError } from "./errors"
import { stableStringify } from "./versions"

export const idempotencyKeyField = z
  .string()
  .min(8)
  .max(200)
  .regex(/^[A-Za-z0-9._:-]+$/, "Use letters, digits and . _ : - only, e.g. a UUID")
  .describe(
    "Unique key for this write, e.g. a new UUID. When retrying after a timeout or error, send the same key with the same payload: the original result is returned and nothing is written twice. Use a new key for every new change."
  )

export interface MutationSpec {
  // Operation (tool) name: idempotency keys are scoped to the actor and the operation
  operation: string
  idempotencyKey: string
  // The request without its idempotency key. A retry must send the same payload
  payload: unknown
  recordType: string
  // Record the write targets, for the audit trail of failed writes
  recordId?: string
  // Non-sensitive context kept in the audit trail, such as the source URL of a project draft
  auditDetails?: Record<string, unknown>
}

export interface MutationOutcome<T> {
  result: T
  // True when the result is the stored outcome of an earlier call with the same key and payload
  replayed: boolean
}

async function audit(
  ctx: ServiceContext,
  actor: Actor,
  spec: MutationSpec,
  outcome: string,
  recordId: string | undefined,
  db: Pick<Tx, "insert"> = ctx.db
) {
  await db.insert(mcpAuditEvents).values({
    actor_sub: actor.sub,
    actor_email: actor.email,
    client_id: actor.clientId,
    tool: spec.operation,
    record_type: spec.recordType,
    record_id: recordId,
    outcome,
    details: spec.auditDetails,
  })
}

// Runs a team write atomically and at most once per actor, operation and idempotency key:
// - The key is claimed, the write runs and its result is stored in one transaction, so a failed write leaves nothing behind
//   (not even the key) and a concurrent retry with the same key waits for the first one and then gets its result.
// - The same key with a different payload is a conflict.
// - Every outcome is recorded in the audit trail with the actor, operation and record id, without the record's content.
export async function runMutation<T extends { id: string }>(
  ctx: ServiceContext,
  spec: MutationSpec,
  write: (tx: Tx, actor: Actor) => Promise<T>
): Promise<MutationOutcome<T>> {
  const actor = requireTeam(ctx, "write")
  const requestHash = createHash("sha256").update(stableStringify(spec.payload)).digest("base64url")
  const keyFilter = and(
    eq(mcpIdempotencyKeys.actor, actor.sub),
    eq(mcpIdempotencyKeys.tool, spec.operation),
    eq(mcpIdempotencyKeys.key, spec.idempotencyKey)
  )

  try {
    const outcome = await ctx.db.transaction(async (tx) => {
      const claimed = await tx
        .insert(mcpIdempotencyKeys)
        .values({ actor: actor.sub, tool: spec.operation, key: spec.idempotencyKey, request_hash: requestHash, response: {} })
        .onConflictDoNothing()
        .returning({ key: mcpIdempotencyKeys.key })

      if (claimed.length === 0) {
        const [previous] = await tx.select().from(mcpIdempotencyKeys).where(keyFilter)
        if (!previous || previous.request_hash !== requestHash) {
          throw conflict("This idempotency_key was already used for a different request. Use a new key for a new change.")
        }

        return { result: previous.response as T, replayed: true }
      }

      const result = await write(tx, actor)
      await tx.update(mcpIdempotencyKeys).set({ response: result }).where(keyFilter)
      await audit(ctx, actor, spec, "success", result.id, tx)

      return { result, replayed: false }
    })

    if (outcome.replayed) {
      await audit(ctx, actor, spec, "replayed", outcome.result.id).catch((error) => console.error("Could not record the audit event", error))
    }

    return outcome
  } catch (error) {
    const code = error instanceof ServiceError ? error.code : "internal_error"
    await audit(ctx, actor, spec, code, spec.recordId).catch((auditError) => console.error("Could not record the audit event", auditError))
    throw error
  }
}
