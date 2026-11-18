import type { Context } from "@/apollo/types"
import { Resolvers } from "@/generated/graphql"
import { currentContent } from "@/services/translations"
import type { Language } from "@lumi/shared-contracts/language"

import { translationsForGraphQL } from "../translations"
import { parseLanguage } from "../validation"

// The company, or null until it is first saved
async function getCompany(context: Context, language: Language) {
  const company = await context.dataSources.db.getCompany()
  if (!company) return null

  const [localized] = await context.dataSources.db.localize("company", [company], currentContent(language))
  return { ...localized, created_at: localized.created_at.toISOString(), translations: translationsForGraphQL(localized.translations) }
}

export const companyResolvers: Resolvers = {
  Query: {
    company: async (_, { language }, context) => getCompany(context, parseLanguage(language)),
  },
  Mutation: {
    updateCompany: async (_, { input, language }, context) => context.dataSources.db.updateCompany(input, parseLanguage(language)),
  },
}
