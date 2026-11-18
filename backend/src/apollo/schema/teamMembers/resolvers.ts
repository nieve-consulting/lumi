import type { Context } from "@/apollo/types"
import { Resolvers } from "@/generated/graphql"
import { publicContext } from "@/services/context"
import { ServiceError } from "@/services/errors"
import { COMPLETE_NESTED_LIMIT } from "@/services/pagination"
import { getPublicTeamMember as getPublicTeamMemberRecord } from "@/services/teamMembers"
import { currentContent, type LocalizedContent, type RecordTranslation } from "@/services/translations"
import type { teamMembers } from "@db/schema"
import type { Language } from "@lumi/shared-contracts/language"
import { GraphQLError } from "graphql"

import { translationsForGraphQL } from "../translations"
import { deleteUploadedFile } from "../uploads/deleteUploadedFile"
import { checkAdmin, parseLanguage, parseOptionalLanguage } from "../validation"

type LocalizedTeamMember = typeof teamMembers.$inferSelect &
  LocalizedContent<"teamMember"> & { language: Language; fallback_fields: string[]; translations: RecordTranslation<"teamMember">[] }

// A team member read in a language, whose nested records are read in the requested one
function toTeamMember(teamMember: LocalizedTeamMember, requested_language: Language) {
  return {
    ...teamMember,
    created_at: teamMember.created_at.toISOString(),
    updated_at: teamMember.updated_at.toISOString(),
    translations: translationsForGraphQL(teamMember.translations),
    requested_language,
  }
}

async function getTeamMembers(context: Context, language: Language, missingLanguage: Language | undefined, includeUnpublished: boolean) {
  const teamMembers = await context.dataSources.db.getTeamMembers(missingLanguage, includeUnpublished)
  return (await context.dataSources.db.localize("teamMember", teamMembers, currentContent(language))).map((teamMember) =>
    toTeamMember(teamMember, language)
  )
}

// An unpublished team member is not found unless includeUnpublished, like a missing id
async function getTeamMember(id: string, context: Context, language: Language, includeUnpublished: boolean) {
  const teamMember = await context.dataSources.db.getTeamMemberById(id)
  if (!teamMember || (!includeUnpublished && !teamMember.published)) {
    throw new GraphQLError("Team member not found")
  }

  const [localized] = await context.dataSources.db.localize("teamMember", [teamMember], currentContent(language))
  return toTeamMember(localized, language)
}

async function getTeamMemberBySlug(slug: string, context: Context, language: Language, includeUnpublished: boolean) {
  const teamMember = await context.dataSources.db.getTeamMemberBySlug(slug)
  if (!teamMember || (!includeUnpublished && !teamMember.published)) {
    throw new GraphQLError("Team member not found")
  }

  const [localized] = await context.dataSources.db.localize("teamMember", [teamMember], currentContent(language))
  return toTeamMember(localized, language)
}

// Same public-data policy as the chatbot and the anonymous MCP tools; a team member who is not public is null. For the resume
// PDF, which reads current content like them, so it never prints an outdated translation the chat card showed in English
async function getPublicTeamMember(id: string, context: Context, language: Language) {
  try {
    const { record } = await getPublicTeamMemberRecord(publicContext(context.drizzle), id, {
      nestedLimit: COMPLETE_NESTED_LIMIT,
      language: currentContent(language),
    })
    return {
      ...record,
      experiences: record.experiences.items,
      capabilities: record.capabilities.items.map(({ name, stars, language, fallback_fields }) => ({ name, stars, language, fallback_fields })),
      project_contributions: record.project_contributions.items,
    }
  } catch (error) {
    if (error instanceof ServiceError && error.code === "not_found") return null
    throw error
  }
}

async function getTeamMembersByProjectId(projectId: string, context: Context, language: Language, includeUnpublished: boolean) {
  return await context.dataSources.db.getTeamMembersByProjectId(projectId, currentContent(language), includeUnpublished).then((teamMembers) =>
    teamMembers.map((c) => ({
      ...c,
      start_date: c.start_date.toISOString(),
      end_date: c.end_date?.toISOString(),
      translations: translationsForGraphQL(c.translations),
      teamMember: toTeamMember(c.teamMember, language),
    }))
  )
}

async function deleteTeamMember(id: string, context: Context) {
  const teamMember = await context.dataSources.db.getTeamMemberByIdWithExperience(id)
  if (!teamMember) {
    throw new GraphQLError("Team member not found")
  }

  // The images go only once the team member and their experience are deleted
  if (!(await context.dataSources.db.deleteTeamMember(id))) return false
  const keys = [teamMember.profile_photo_key, ...teamMember.experiences.map((experience) => experience.logo_key)]
  await Promise.all(keys.filter((key) => key !== null).map((key) => deleteUploadedFile(context, key)))
  return true
}

async function linkUploadToTeamMemberPhoto(teamMemberId: string, key: string, context: Context) {
  const teamMember = await context.dataSources.db.getTeamMemberById(teamMemberId)
  if (!teamMember) {
    throw new GraphQLError("Team member not found")
  }

  // The old image goes only once the record no longer uses it
  if (!(await context.dataSources.db.linkUploadToTeamMemberPhoto(key, teamMemberId))) return false
  if (teamMember.profile_photo_key) {
    await deleteUploadedFile(context, teamMember.profile_photo_key)
  }
  return true
}

export const teamMemberResolvers: Resolvers<Context> = {
  Query: {
    teamMembers: async (_, { language, missingLanguage, includeUnpublished }, context) =>
      getTeamMembers(context, parseLanguage(language), parseOptionalLanguage(missingLanguage), includeUnpublished ?? false),
    teamMember: async (_, { id, language, includeUnpublished }, context) =>
      getTeamMember(id, context, parseLanguage(language), includeUnpublished ?? false),
    teamMemberBySlug: async (_, { url_slug, language, includeUnpublished }, context) =>
      getTeamMemberBySlug(url_slug, context, parseLanguage(language), includeUnpublished ?? false),
    publicTeamMember: async (_, { id, language }, context) => getPublicTeamMember(id, context, parseLanguage(language)),
  },
  Project: {
    teamMembers: async (project, { includeUnpublished }, context) =>
      getTeamMembersByProjectId(project.id, context, project.requested_language, includeUnpublished ?? false),
  },
  Mutation: {
    createTeamMember: async (_, { input }, context) => {
      checkAdmin.teamMember(input)
      const result = await context.dataSources.db.createTeamMember(input)
      return result.id
    },
    updateTeamMember: async (_, { id, input, language }, context) => {
      const inLanguage = parseLanguage(language)
      checkAdmin.teamMember(input, inLanguage)
      return context.dataSources.db.updateTeamMember(id, input, inLanguage)
    },
    deleteTeamMember: async (_, { id }, context) => deleteTeamMember(id, context),
    linkUploadToTeamMemberPhoto: async (_, { key, teamMemberId }, context) => linkUploadToTeamMemberPhoto(teamMemberId, key, context),
  },
}
