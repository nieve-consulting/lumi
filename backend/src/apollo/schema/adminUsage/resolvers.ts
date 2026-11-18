import { computeCost } from "@/ai/pricing"
import { addAdminUsage } from "@/apollo/sources/adminUsage"
import { Resolvers } from "@/generated/graphql"
import { ADMIN_PURPOSES } from "@lumi/shared-contracts/usage"
import { z } from "zod"

import { checkAdminInput } from "../validation"

const tokens = z.number().int().min(0)

const adminUsageRules = z.object({
  purpose: z.enum(ADMIN_PURPOSES),
  model: z.string().trim().min(1).max(100),
  adminEmail: z.email().max(320),
  inputTokens: tokens,
  cachedInputTokens: tokens.nullish(),
  cacheWriteTokens: tokens.nullish(),
  outputTokens: tokens,
  reasoningTokens: tokens.nullish(),
})

export const adminUsageResolvers: Resolvers = {
  Mutation: {
    recordAdminUsage: async (_, { input }, context) => {
      checkAdminInput(adminUsageRules, input)

      const usage = {
        inputTokens: input.inputTokens,
        cachedInputTokens: input.cachedInputTokens ?? 0,
        cacheWriteTokens: input.cacheWriteTokens ?? 0,
        outputTokens: input.outputTokens,
        reasoningTokens: input.reasoningTokens ?? 0,
      }
      const model = input.model.trim()
      const cost = computeCost(model, usage)
      if (cost === null) {
        console.warn(`No price for model ${model}: its usage is recorded without a cost`)
      }

      return addAdminUsage(context.drizzle, { ...usage, model, purpose: input.purpose, adminEmail: input.adminEmail, cost })
    },
  },
}
