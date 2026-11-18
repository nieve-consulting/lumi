import type { Context } from "@/apollo/types"
import { Resolvers, TeamMemberCapabilityInput } from "@/generated/graphql"
import { localizedAs } from "@/services/records"
import { currentContent, type LocalizedContent, type RecordTranslation } from "@/services/translations"
import type { capabilities } from "@db/schema"
import type { Language } from "@lumi/shared-contracts/language"
import { GraphQLError } from "graphql"

import { translationsForGraphQL } from "../translations"
import { checkAdmin, parseLanguage, parseOptionalLanguage } from "../validation"

type LocalizedCapability = typeof capabilities.$inferSelect &
  LocalizedContent<"capability"> & { language: Language; fallback_fields: string[]; translations: RecordTranslation<"capability">[] }

function toCapability(capability: LocalizedCapability) {
  return { ...capability, created_at: capability.created_at.toISOString(), translations: translationsForGraphQL(capability.translations) }
}

async function getCapabilities(context: Context, language: Language, missingLanguage: Language | undefined, includeUnpublished: boolean) {
  const capabilities = await context.dataSources.db.getCapabilities(language, missingLanguage, includeUnpublished)
  return (await context.dataSources.db.localize("capability", capabilities, currentContent(language))).map(toCapability)
}

// A capability that is not public is not found unless includeUnpublished, like a missing id
async function getCapability(id: string, context: Context, language: Language, includeUnpublished: boolean) {
  const capability = await context.dataSources.db.getCapabilityById(id, includeUnpublished)
  if (!capability) {
    throw new GraphQLError("Capability not found")
  }

  const [localized] = await context.dataSources.db.localize("capability", [capability], currentContent(language))
  return toCapability(localized)
}

async function getProjectCapabilities(projectId: string, context: Context, language: Language) {
  const capabilities = await context.dataSources.db.getProjectCapabilities(projectId, language)
  return (await context.dataSources.db.localize("capability", capabilities, currentContent(language))).map(toCapability)
}

async function getTeamMemberCapabilities(teamMemberId: string, context: Context, language: Language) {
  const capabilities = await context.dataSources.db.getTeamMemberCapabilities(teamMemberId, language)
  // A team member's capability returns only the capability's name
  return (await context.dataSources.db.localize("capability", capabilities, currentContent(language))).map((capability) => ({
    ...capability,
    ...localizedAs(capability, ["name"]),
  }))
}

export const capabilityResolvers: Resolvers<Context> = {
  Query: {
    capabilities: async (_, { language, missingLanguage, includeUnpublished }, context) =>
      getCapabilities(context, parseLanguage(language), parseOptionalLanguage(missingLanguage), includeUnpublished ?? false),
    capability: async (_, { id, language, includeUnpublished }, context) =>
      getCapability(id, context, parseLanguage(language), includeUnpublished ?? false),
  },
  TeamMember: {
    capabilities: async (teamMember, _, context) => getTeamMemberCapabilities(teamMember.id, context, teamMember.requested_language),
  },
  Project: {
    capabilities: async (project, _, context) => getProjectCapabilities(project.id, context, project.requested_language),
  },
  Mutation: {
    addCapabilitiesToTeamMember: async (_, { teamMemberId, input }, context) => {
      checkAdmin.stars(input)
      return context.dataSources.db.addCapabilitiesToTeamMember(
        teamMemberId,
        input.filter((capability): capability is TeamMemberCapabilityInput => !!capability)
      )
    },
    updateTeamMemberCapabilities: async (_, { teamMemberId, input }, context) => {
      checkAdmin.stars(input)
      return context.dataSources.db.updateTeamMemberCapabilities(
        teamMemberId,
        input.filter((capability): capability is TeamMemberCapabilityInput => !!capability)
      )
    },
    removeTeamMemberCapabilities: async (_, { teamMemberId, ids }, context) => {
      await context.dataSources.db.removeTeamMemberCapabilities(
        teamMemberId,
        ids.filter((id): id is string => !!id)
      )
      return true
    },
    addCapabilitiesToProject: async (_, { projectId, capabilityIds }, context) =>
      context.dataSources.db.addCapabilitiesToProject(projectId, capabilityIds),
    removeProjectCapabilities: async (_, { projectId, ids }, context) =>
      context.dataSources.db.removeProjectCapabilities(
        projectId,
        ids.filter((id): id is string => !!id)
      ),
    createCapability: async (_, { input }, context) => {
      checkAdmin.capability(input)
      const result = await context.dataSources.db.createCapability(input)
      return result.id
    },
    updateCapability: async (_, { id, input, language }, context) => {
      const inLanguage = parseLanguage(language)
      checkAdmin.capability(input, inLanguage)
      return context.dataSources.db.updateCapability(id, input, inLanguage)
    },
    deleteCapability: async (_, { id }, context) => context.dataSources.db.deleteCapability(id),
  },
}
