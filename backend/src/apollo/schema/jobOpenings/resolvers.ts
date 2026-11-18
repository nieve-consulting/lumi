import type { Context } from "@/apollo/types"
import { Resolvers } from "@/generated/graphql"
import { currentContent, type LocalizedContent, type RecordTranslation } from "@/services/translations"
import type { jobOpenings } from "@db/schema"
import type { Language } from "@lumi/shared-contracts/language"
import { GraphQLError } from "graphql"

import { translationsForGraphQL } from "../translations"
import { asGraphQLError, checkAdmin, parseLanguage, parseOptionalLanguage } from "../validation"

// Job openings for the admin and, published ones only, for the business's website, which lists them and renders their
// details in each language. Outdated translations read in English (currentContent), so no one sees facts corrected since

type LocalizedJobOpening = typeof jobOpenings.$inferSelect &
  LocalizedContent<"jobOpening"> & { language: Language; fallback_fields: string[]; translations: RecordTranslation<"jobOpening">[] }

function toJobOpening(jobOpening: LocalizedJobOpening) {
  return {
    ...jobOpening,
    created_at: jobOpening.created_at.toISOString(),
    updated_at: jobOpening.updated_at.toISOString(),
    posted_at: jobOpening.posted_at.toISOString(),
    translations: translationsForGraphQL(jobOpening.translations),
  }
}

async function getJobOpenings(context: Context, language: Language, missingLanguage: Language | undefined, includeUnpublished: boolean) {
  const rows = await context.dataSources.db.getJobOpenings(missingLanguage, includeUnpublished)
  return (await context.dataSources.db.localize("jobOpening", rows, currentContent(language))).map(toJobOpening)
}

// An unpublished job opening is not found unless includeUnpublished, like a missing one
async function localizedJobOpening(
  jobOpening: typeof jobOpenings.$inferSelect | undefined,
  context: Context,
  language: Language,
  includeUnpublished: boolean
) {
  if (!jobOpening || (!includeUnpublished && !jobOpening.published)) {
    throw new GraphQLError("Job opening not found")
  }

  const [localized] = await context.dataSources.db.localize("jobOpening", [jobOpening], currentContent(language))
  return toJobOpening(localized)
}

export const jobOpeningResolvers: Resolvers = {
  Query: {
    jobOpenings: async (_, { language, missingLanguage, includeUnpublished }, context) =>
      getJobOpenings(context, parseLanguage(language), parseOptionalLanguage(missingLanguage), includeUnpublished ?? false),
    jobOpening: async (_, { id, language, includeUnpublished }, context) =>
      localizedJobOpening(await context.dataSources.db.getJobOpeningById(id), context, parseLanguage(language), includeUnpublished ?? false),
    jobOpeningBySlug: async (_, { url_slug, language, includeUnpublished }, context) =>
      localizedJobOpening(await context.dataSources.db.getJobOpeningBySlug(url_slug), context, parseLanguage(language), includeUnpublished ?? false),
  },
  Mutation: {
    // A slug another job opening uses is a user input error naming it
    createJobOpening: async (_, { input }, context) => {
      checkAdmin.jobOpening(input)
      try {
        const result = await context.dataSources.db.createJobOpening(input)
        return result.id
      } catch (error) {
        asGraphQLError(error)
      }
    },
    updateJobOpening: async (_, { id, input, language }, context) => {
      const inLanguage = parseLanguage(language)
      checkAdmin.jobOpening(input, inLanguage)
      try {
        return await context.dataSources.db.updateJobOpening(id, input, inLanguage)
      } catch (error) {
        asGraphQLError(error)
      }
    },
    deleteJobOpening: async (_, { id }, context) => {
      const jobOpening = await context.dataSources.db.getJobOpeningById(id)
      if (!jobOpening) throw new GraphQLError("Job opening not found")
      return context.dataSources.db.deleteJobOpening(id)
    },
  },
}
