import "server-only"

import type { AdminUsageInput, Mutation, MutationRecordAdminUsageArgs } from "@/generated/graphql"
import { gql } from "@apollo/client"
import type { AdminPurpose } from "@lumi/shared-contracts/usage"
import type { LanguageModelUsage } from "ai"

import { getClient } from "./apiClient"
import { traceModelCall, type ModelCallOptions } from "./tracing"

export interface AdminModelCall {
  purpose: AdminPurpose
  // The model id the call is priced by, e.g. WRITING_MODEL.model
  model: string
  // The admin making the call, from the route's access check
  adminEmail: string
  // Groups related calls in one Langfuse session, e.g. a bulk translation run
  sessionId?: string
  // String values of at most 200 characters, as Langfuse drops others
  metadata?: Record<string, string>
}

const sum = (values: (number | undefined)[]) => values.reduce<number>((total, value) => total + (value ?? 0), 0)

// The usage input of the call's usage, summed over its steps, or undefined when the provider reported none
function usageInput({ purpose, model, adminEmail }: AdminModelCall, usage: LanguageModelUsage[]): AdminUsageInput | undefined {
  if (!usage.some(({ inputTokens, outputTokens }) => inputTokens !== undefined || outputTokens !== undefined)) return undefined
  return {
    purpose,
    model,
    adminEmail,
    // The AI SDK's input tokens include cached and cache write tokens, and its output tokens reasoning tokens, as the
    // input expects
    inputTokens: sum(usage.map(({ inputTokens }) => inputTokens)),
    cachedInputTokens: sum(usage.map(({ inputTokenDetails }) => inputTokenDetails.cacheReadTokens)),
    cacheWriteTokens: sum(usage.map(({ inputTokenDetails }) => inputTokenDetails.cacheWriteTokens)),
    outputTokens: sum(usage.map(({ outputTokens }) => outputTokens)),
    reasoningTokens: sum(usage.map(({ outputTokenDetails }) => outputTokenDetails.reasoningTokens)),
  }
}

// Records the call's usage for Lumi's usage and cost data. It runs after the response, without checking admin access
// again: a long call can outlast the session the route checked, and the usage would be lost. The backend logs a usage it
// couldn't save, answering false, which is ignored
async function recordUsage(call: AdminModelCall, usage: LanguageModelUsage[]) {
  const input = usageInput(call, usage)
  if (!input) return
  try {
    await getClient().mutate<Mutation, MutationRecordAdminUsageArgs>({
      mutation: gql`
        mutation ($input: AdminUsageInput!) {
          recordAdminUsage(input: $input)
        }
      `,
      variables: { input },
    })
  } catch (e) {
    console.error("Error recording the admin's model usage", e)
  }
}

// Runs one of the admin's streaming AI SDK calls (streamText): traced in Langfuse under the purpose with the admin as its
// user, and its usage recorded once it has ended, after the response. The callback passes the options on to streamText
export function adminModelCall<T extends { consumeStream(): PromiseLike<void>; usage: PromiseLike<LanguageModelUsage> }>(
  call: AdminModelCall,
  fn: (options: ModelCallOptions) => T
): T {
  return traceModelCall({ name: call.purpose, userId: call.adminEmail, sessionId: call.sessionId, metadata: call.metadata }, fn, (usage) =>
    recordUsage(call, usage)
  )
}
