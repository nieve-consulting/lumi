import type { Resolvers } from "@/generated/graphql"
import { getResumeSettings, settingsOf, updateResumeSettings, type ResumeSettingsRecord } from "@/services/resumeSettings"
import { ResumeSettingsError } from "@lumi/shared-contracts/resume"
import { GraphQLError } from "graphql"

import { asGraphQLError } from "../validation"

// The resume settings (src/services/resumeSettings.ts). Public business data: read-only API keys may read them, as the web app
// does to render the PDF and to decide whether to link it (src/apollo/access.ts). The web app checks admin access before
// calling updateResumeSettings, which admin API keys may also call, like the other settings

// The settings as saved, so an admin sees and can correct them, or the defaults with no updatedAt until the first save
function toResumeSettings(record: ResumeSettingsRecord | null) {
  const settings = settingsOf(record)
  return {
    enabled: settings.enabled,
    logoUrl: settings.logoUrl ?? null,
    headerColor: settings.headerColor ?? null,
    accentColor: settings.accentColor ?? null,
    gradientColor: settings.gradientColor ?? null,
    footerText: settings.footerText ?? null,
    updatedAt: record?.updated_at.toISOString() ?? null,
  }
}

// Problems with the settings list each field, for the form to show next to it
function asResumeSettingsError(error: unknown): never {
  if (error instanceof ResumeSettingsError) {
    throw new GraphQLError(error.message, { extensions: { code: "BAD_USER_INPUT", problems: error.problems } })
  }
  asGraphQLError(error)
}

export const resumeResolvers: Resolvers = {
  Query: {
    resumeSettings: async (_, __, context) => toResumeSettings(await getResumeSettings(context.drizzle)),
  },
  Mutation: {
    updateResumeSettings: async (_, { input }, context) => {
      try {
        return toResumeSettings(await updateResumeSettings(context.drizzle, input))
      } catch (error) {
        asResumeSettingsError(error)
      }
    },
  },
}
