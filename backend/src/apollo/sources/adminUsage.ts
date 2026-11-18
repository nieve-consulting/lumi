import { computeCost } from "@/ai/pricing"
import type { EmbeddingUsage, ModelCallUsage } from "@/ai/usage"
import type { DbType } from "@db/db"
import { adminUsage } from "@db/schema"

import { inRange, usageByModel, type DashboardRange } from "./dbDataSource"

// Usage and cost of the team's own model calls in the admin (record translation, the editor's writing assistant). The
// frontend makes them with the AI SDK and records each through the recordAdminUsage mutation; the website crawler records
// the embeddings of the crawls an admin starts

export type AdminCallUsage = ModelCallUsage & { adminEmail: string }

// Saves the calls. Errors are logged rather than thrown so failing to record usage never fails the admin's request
export async function addAdminUsage(db: DbType, ...calls: AdminCallUsage[]) {
  if (calls.length === 0) return true

  try {
    await db.insert(adminUsage).values(
      calls.map((call) => ({
        admin_email: call.adminEmail,
        model: call.model,
        purpose: call.purpose,
        input_tokens: call.inputTokens,
        cached_input_tokens: call.cachedInputTokens,
        cache_write_tokens: call.cacheWriteTokens,
        output_tokens: call.outputTokens,
        reasoning_tokens: call.reasoningTokens,
        cost: call.cost,
      }))
    )

    return true
  } catch (error) {
    console.error("Error recording the usage of admin calls", calls[0].purpose, error)
    return false
  }
}

// Records embedding requests made for an admin outside a conversation (a website crawl) with the
// admin's own calls under the purpose. Without an admin they are only logged. Failing to record them never fails the work
export async function addAdminEmbeddingUsage(db: DbType, adminEmail: string | undefined, purpose: string, requests: EmbeddingUsage[]) {
  if (requests.length === 0) return

  const calls = requests.map(({ model, inputTokens }) => {
    const tokens = { inputTokens, cachedInputTokens: 0, cacheWriteTokens: 0, outputTokens: 0, reasoningTokens: 0 }
    return { ...tokens, model, purpose, cost: computeCost(model, tokens) }
  })

  if (!adminEmail) {
    console.warn("Embedding usage not recorded: no admin asked for it", calls)
    return
  }

  await addAdminUsage(db, ...calls.map((call) => ({ ...call, adminEmail })))
}

// Token usage and cost per purpose and model of the range's calls, most expensive first. The cost is null when a call has no
// price, as for thread usage
export async function getAdminUsage(db: DbType, range: DashboardRange) {
  return usageByModel(db, adminUsage, inRange(adminUsage.created_at, range))
}
