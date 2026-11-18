import type { Context } from "@/apollo/types"
import { Resolvers } from "@/generated/graphql"
import { currentContent, type LocalizedContent, type RecordTranslation } from "@/services/translations"
import type { projects } from "@db/schema"
import type { Language } from "@lumi/shared-contracts/language"
import { GraphQLError } from "graphql"

import { translationsForGraphQL } from "../translations"
import { deleteUploadedFile } from "../uploads/deleteUploadedFile"
import { checkAdmin, parseLanguage, parseOptionalLanguage } from "../validation"

type LocalizedProject = typeof projects.$inferSelect &
  LocalizedContent<"project"> & { language: Language; fallback_fields: string[]; translations: RecordTranslation<"project">[] }

// A project read in a language, whose nested records are read in the requested one
function toProject(project: LocalizedProject, requested_language: Language) {
  return {
    ...project,
    created_at: project.created_at.toISOString(),
    updated_at: project.updated_at.toISOString(),
    start_date: project.start_date.toISOString(),
    end_date: project.end_date?.toISOString(),
    translations: translationsForGraphQL(project.translations),
    requested_language,
  }
}

async function getProjects(context: Context, language: Language, missingLanguage: Language | undefined, includeUnpublished: boolean) {
  const projects = await context.dataSources.db.getProjects(missingLanguage, includeUnpublished)
  return (await context.dataSources.db.localize("project", projects, currentContent(language))).map((project) => toProject(project, language))
}

// An unpublished project is not found unless includeUnpublished, like a missing id
async function getProject(id: string, context: Context, language: Language, includeUnpublished: boolean) {
  const project = await context.dataSources.db.getProjectById(id)
  if (!project || (!includeUnpublished && !project.published)) {
    throw new GraphQLError("Project not found")
  }

  const [localized] = await context.dataSources.db.localize("project", [project], currentContent(language))
  return toProject(localized, language)
}

async function getProjectBySlug(slug: string, context: Context, language: Language, includeUnpublished: boolean) {
  const project = await context.dataSources.db.getProjectBySlug(slug)
  if (!project || (!includeUnpublished && !project.published)) {
    throw new GraphQLError("Project not found")
  }

  const [localized] = await context.dataSources.db.localize("project", [project], currentContent(language))
  return toProject(localized, language)
}

async function getProjectsContributions(teamMemberId: string, context: Context, language: Language, includeUnpublished: boolean) {
  return context.dataSources.db.getProjectContributions(teamMemberId, currentContent(language), includeUnpublished).then((contributions) =>
    contributions.map((c) => ({
      ...c,
      project: toProject(c.project, language),
      start_date: c.start_date.toISOString(),
      end_date: c.end_date?.toISOString(),
      translations: translationsForGraphQL(c.translations),
    }))
  )
}

async function getClientProjects(clientId: string, context: Context, language: Language, includeUnpublished: boolean) {
  const projects = await context.dataSources.db.getClientProjects(clientId, includeUnpublished)
  return (await context.dataSources.db.localize("project", projects, currentContent(language))).map((project) => toProject(project, language))
}

// An id that is not a UUID names no project, and the database refuses to compare one
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

// Deletes the project, then its image. False when the project couldn't be deleted, which leaves its image as it is
async function deleteProject(id: string, context: Context) {
  if (!UUID.test(id)) {
    throw new GraphQLError("Project not found")
  }

  let deleted
  try {
    deleted = await context.dataSources.db.deleteProject(id)
  } catch (error) {
    console.error(`Couldn't delete project ${id}`, (error as Error).message)
    return false
  }
  if (!deleted) {
    throw new GraphQLError("Project not found")
  }

  if (deleted.image_key) {
    await deleteUploadedFile(context, deleted.image_key)
  }
  return true
}

async function linkUploadToProjectImage(projectId: string, key: string, context: Context) {
  const project = await context.dataSources.db.getProjectById(projectId)
  if (!project) {
    throw new GraphQLError("Project not found")
  }

  // The old image goes only once the record no longer uses it
  if (!(await context.dataSources.db.linkUploadToProjectImage(key, projectId))) return false
  if (project.image_key) {
    await deleteUploadedFile(context, project.image_key)
  }
  return true
}

export const projectsResolvers: Resolvers = {
  Query: {
    projects: async (_, { language, missingLanguage, includeUnpublished }, context) =>
      getProjects(context, parseLanguage(language), parseOptionalLanguage(missingLanguage), includeUnpublished ?? false),
    project: async (_, { id, language, includeUnpublished }, context) =>
      getProject(id, context, parseLanguage(language), includeUnpublished ?? false),
    projectBySlug: async (_, { url_slug, language, includeUnpublished }, context) =>
      getProjectBySlug(url_slug, context, parseLanguage(language), includeUnpublished ?? false),
  },
  TeamMember: {
    project_contributions: async (teamMember, { includeUnpublished }, context) =>
      getProjectsContributions(teamMember.id, context, teamMember.requested_language, includeUnpublished ?? false),
  },
  Client: {
    projects: async (client, { includeUnpublished }, context) =>
      getClientProjects(client.id, context, client.requested_language, includeUnpublished ?? false),
  },
  Mutation: {
    createProject: async (_, { input }, context) => {
      checkAdmin.project(input)
      const result = await context.dataSources.db.createProject(input)
      return result.id
    },
    updateProject: async (_, { id, input, language }, context) => {
      const inLanguage = parseLanguage(language)
      checkAdmin.project(input, inLanguage)
      return context.dataSources.db.updateProject(id, input, inLanguage)
    },
    deleteProject: async (_, { id }, context) => deleteProject(id, context),
    addTeamMembersToProject: async (_, { projectId, teamMembers }, context) => {
      checkAdmin.contributions(teamMembers)
      return context.dataSources.db.addTeamMembersToProject(projectId, teamMembers)
    },
    updateProjectTeamMember: async (_, { projectId, teamMembers, language }, context) => {
      const inLanguage = parseLanguage(language)
      checkAdmin.contributions(teamMembers, inLanguage)
      return context.dataSources.db.updateProjectTeamMember(projectId, teamMembers, inLanguage)
    },
    removeTeamMembersFromProject: async (_, { projectId, teamMemberIds }, context) =>
      context.dataSources.db.removeTeamMembersFromProject(projectId, teamMemberIds),
    linkUploadToProjectImage: async (_, { key, projectId }, context) => linkUploadToProjectImage(projectId, key, context),
  },
}
