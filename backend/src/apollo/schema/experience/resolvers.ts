import type { Context } from "@/apollo/types"
import { ExperienceInput, Resolvers } from "@/generated/graphql"
import { currentContent } from "@/services/translations"
import type { Language } from "@lumi/shared-contracts/language"
import { GraphQLError } from "graphql"

import { translationsForGraphQL } from "../translations"
import { deleteUploadedFile } from "../uploads/deleteUploadedFile"
import { checkAdmin, parseLanguage } from "../validation"

async function getTeamMemberExperiece(context: Context, teamMemberId: string, language: Language) {
  const experiences = await context.dataSources.db.getTeamMemberExperiece(teamMemberId)
  return (await context.dataSources.db.localize("experience", experiences, currentContent(language))).map((experience) => ({
    ...experience,
    created_at: experience.created_at.toISOString(),
    start_date: experience.start_date.toISOString(),
    end_date: experience.end_date?.toISOString(),
    translations: translationsForGraphQL(experience.translations),
  }))
}

async function removeExperiences(ids: string[], context: Context) {
  const removeExperiencePromises = ids.map(async (id) => {
    const experience = await context.dataSources.db.getExperienceById(id)

    if (!experience) {
      throw new GraphQLError("Experience not found")
    }

    // The logo goes only once the experience is deleted
    if (!(await context.dataSources.db.removeExperiences([id]))) return false
    if (experience.logo_key) {
      await deleteUploadedFile(context, experience.logo_key)
    }
    return true
  })

  return (await Promise.all(removeExperiencePromises)).every(Boolean)
}

async function linkUploadToExperienceLogo(experienceId: string, key: string, context: Context) {
  const experience = await context.dataSources.db.getExperienceById(experienceId)
  if (!experience) {
    throw new GraphQLError("Experience not found")
  }

  // The old image goes only once the record no longer uses it
  if (!(await context.dataSources.db.linkUploadToExperienceLogo(key, experienceId))) return false
  if (experience.logo_key) {
    await deleteUploadedFile(context, experience.logo_key)
  }
  return true
}

export const experienceResolvers: Resolvers<Context> = {
  TeamMember: {
    experiences: async ({ id, requested_language }, _, context) => getTeamMemberExperiece(context, id, requested_language),
  },
  Mutation: {
    addExperiencesToTeamMember: async (_, { teamMemberId, input }, context) => {
      checkAdmin.experiences(input)
      const result = await context.dataSources.db.addExperiencesToTeamMember(teamMemberId, input as ExperienceInput[])
      return result.map(({ id }) => id)
    },
    updateExperiences: async (_, { input, language }, context) => {
      const inLanguage = parseLanguage(language)
      checkAdmin.experiences(input, inLanguage)
      return context.dataSources.db.updateExperiences(input as ExperienceInput[], inLanguage)
    },
    removeExperiences: async (_, { ids }, context) => removeExperiences(ids as string[], context),
    linkUploadToExperienceLogo: async (_, { key, experienceId }, context) => linkUploadToExperienceLogo(experienceId, key, context),
  },
}
