import type { Resolvers } from "@/generated/graphql"
import { KnowledgeSettingsError, readKnowledgeSources, updateStructuredSources } from "@/services/knowledgeSettings"
import { GraphQLError } from "graphql"

import { asGraphQLError } from "../validation"

// The structured sources and their labels (src/services/knowledgeSettings.ts). The web app checks admin access before calling
// them, like the business and handoff settings

// Problems with the labels list each field, for the form to show next to it, like the business settings
function asKnowledgeSettingsError(error: unknown): never {
  if (error instanceof KnowledgeSettingsError) {
    throw new GraphQLError(error.message, { extensions: { code: "BAD_USER_INPUT", problems: error.problems } })
  }
  asGraphQLError(error)
}

export const knowledgeResolvers: Resolvers = {
  Query: {
    // Read fresh rather than from the agents' cache, so the settings page shows an edit at once
    knowledgeSources: async (_, __, context) => readKnowledgeSources(context.drizzle),
  },
  Mutation: {
    updateStructuredSources: async (_, { input }, context) => {
      const { teamMembers, projects, clients, capabilities, jobOpenings, labels } = input
      try {
        return await updateStructuredSources(context.drizzle, { teamMembers, projects, clients, capabilities, jobOpenings, labels })
      } catch (error) {
        asKnowledgeSettingsError(error)
      }
    },
  },
}
