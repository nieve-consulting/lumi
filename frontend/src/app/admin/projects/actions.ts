"use server"

import { revalidatePath } from "next/cache"
import type {
  Mutation,
  MutationAddTeamMembersToProjectArgs,
  MutationCreateProjectArgs,
  MutationDeleteProjectArgs,
  MutationLinkUploadToProjectImageArgs,
  MutationRemoveTeamMembersFromProjectArgs,
  MutationUpdateProjectArgs,
  MutationUpdateProjectTeamMemberArgs,
} from "@/generated/graphql"
import { gql } from "@apollo/client"
import type { Language } from "@lumi/shared-contracts/language"

import { getAdminClient } from "@/lib/adminApiClient"
import type { TranslationInput } from "@/app/admin/components/translations/languages"

import { type ProjectFormSchema, type projectOptionalContentFields, type ProjectTeamMemberSchema } from "./components/form/schema"

// A project as a save in a language sends it: content left untranslated outside English is null
type ProjectSaveInput = TranslationInput<ProjectFormSchema, (typeof projectOptionalContentFields)[number]>
type ProjectTeamMemberSaveInput = TranslationInput<ProjectTeamMemberSchema, "description">

export async function createProject(project: ProjectFormSchema) {
  const client = await getAdminClient()

  const { data } = await client.mutate<Mutation, MutationCreateProjectArgs>({
    mutation: gql`
      mutation CreateProject($input: ProjectInput!) {
        createProject(input: $input)
      }
    `,
    variables: {
      input: {
        ...project,
        start_date: project.start_date.toISOString(),
        end_date: project.end_date?.toISOString(),
      },
    },
  })

  revalidatePath("/admin/projects", "layout")
  return data?.createProject
}

// Saves the project's content in the language (English by default), leaving other languages as they are. Only English
// saves the shared fields; the API requires them in every language but ignores them outside English
export async function updateProject(id: string, project: ProjectSaveInput, language?: Language) {
  const client = await getAdminClient()

  const { data } = await client.mutate<Mutation, MutationUpdateProjectArgs>({
    mutation: gql`
      mutation UpdateProject($id: ID!, $input: ProjectInput!, $language: String) {
        updateProject(id: $id, input: $input, language: $language)
      }
    `,
    variables: {
      id,
      language,
      input: {
        ...project,
        start_date: project.start_date.toISOString(),
        end_date: project.end_date?.toISOString(),
      },
    },
  })

  revalidatePath("/admin/projects", "layout")
  return data?.updateProject
}

export async function deleteProject(id: string) {
  const client = await getAdminClient()

  const { data } = await client.mutate<Mutation, MutationDeleteProjectArgs>({
    mutation: gql`
      mutation DeleteProject($id: ID!) {
        deleteProject(id: $id)
      }
    `,
    variables: {
      id,
    },
  })

  revalidatePath("/admin/projects", "layout")
  return data?.deleteProject
}

export async function addTeamMembersToProject(projectId: string, teamMembers: ProjectTeamMemberSchema[]) {
  if (teamMembers.length === 0) return Promise.resolve(true)

  const client = await getAdminClient()

  const { data } = await client.mutate<Mutation, MutationAddTeamMembersToProjectArgs>({
    mutation: gql`
      mutation AddTeamMembersToProject($projectId: ID!, $teamMembers: [ProjectTeamMemberInput!]!) {
        addTeamMembersToProject(projectId: $projectId, teamMembers: $teamMembers)
      }
    `,
    variables: {
      projectId,
      teamMembers: teamMembers.map((c) => ({
        team_member_id: c.teamMemberId,
        description: c.description,
        start_date: c.start_date.toISOString(),
        end_date: c.end_date ? c.end_date.toISOString() : null,
      })),
    },
  })

  revalidatePath(`/admin/projects/edit/${projectId}`, "layout")
  return data?.addTeamMembersToProject
}

// Saves the contributions' descriptions in the language (English by default), and in English their dates too
export async function updateProjectTeamMember(projectId: string, teamMembers: ProjectTeamMemberSaveInput[], language?: Language) {
  const client = await getAdminClient()

  const { data } = await client.mutate<Mutation, MutationUpdateProjectTeamMemberArgs>({
    mutation: gql`
      mutation UpdateProjectTeamMembers($projectId: ID!, $teamMembers: [ProjectTeamMemberInput!]!, $language: String) {
        updateProjectTeamMember(projectId: $projectId, teamMembers: $teamMembers, language: $language)
      }
    `,
    variables: {
      projectId,
      language,
      teamMembers: teamMembers.map((c) => ({
        team_member_id: c.teamMemberId,
        description: c.description,
        start_date: c.start_date.toISOString(),
        end_date: c.end_date ? c.end_date.toISOString() : null,
      })),
    },
  })

  revalidatePath(`/admin/projects/edit/${projectId}`, "layout")
  return data?.updateProjectTeamMember
}

export async function removeTeamMembersFromProject(projectId: string, teamMembers: string[]) {
  const client = await getAdminClient()

  const { data } = await client.mutate<Mutation, MutationRemoveTeamMembersFromProjectArgs>({
    mutation: gql`
      mutation RemoveTeamMembersFromProject($projectId: ID!, $teamMemberIds: [ID!]!) {
        removeTeamMembersFromProject(projectId: $projectId, teamMemberIds: $teamMemberIds)
      }
    `,
    variables: {
      projectId,
      teamMemberIds: teamMembers,
    },
  })

  revalidatePath(`/admin/projects/edit/${projectId}`, "layout")
  return data?.removeTeamMembersFromProject
}

export async function addCapabilitiesToProject(projectId: string, capabilityIds: string[]) {
  const client = await getAdminClient()

  const { data } = await client.mutate<Mutation>({
    mutation: gql`
      mutation AddCapabilitiesToProject($projectId: ID!, $capabilityIds: [ID!]!) {
        addCapabilitiesToProject(projectId: $projectId, capabilityIds: $capabilityIds)
      }
    `,
    variables: {
      projectId,
      capabilityIds,
    },
  })

  revalidatePath(`/admin/projects/edit/${projectId}`, "layout")
  return data?.addCapabilitiesToProject
}

export async function removeCapabilitiesFromProject(projectId: string, capabilityIds: string[]) {
  const client = await getAdminClient()

  const { data } = await client.mutate<Mutation>({
    mutation: gql`
      mutation RemoveCapabilitiesFromProject($projectId: ID!, $ids: [ID!]!) {
        removeProjectCapabilities(projectId: $projectId, ids: $ids)
      }
    `,
    variables: {
      projectId,
      ids: capabilityIds,
    },
  })

  revalidatePath(`/admin/projects/edit/${projectId}`, "layout")
  return data?.removeProjectCapabilities
}

export async function linkUploadToProjectImage(key: string, projectId: string) {
  const client = await getAdminClient()

  const { data } = await client.mutate<Mutation, MutationLinkUploadToProjectImageArgs>({
    mutation: gql`
      mutation LinkUploadToProjectImage($key: ID!, $projectId: ID!) {
        linkUploadToProjectImage(key: $key, projectId: $projectId)
      }
    `,
    variables: {
      key,
      projectId,
    },
  })

  revalidatePath(`/admin/projects/${projectId}`, "layout")
  return data?.linkUploadToProjectImage
}
