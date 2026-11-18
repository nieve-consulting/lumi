"use server"

import { revalidatePath } from "next/cache"
import type {
  ExperienceInput,
  Mutation,
  MutationAddCapabilitiesToTeamMemberArgs,
  MutationAddExperiencesToTeamMemberArgs,
  MutationCreateTeamMemberArgs,
  MutationDeleteTeamMemberArgs,
  MutationLinkUploadToExperienceLogoArgs,
  MutationLinkUploadToTeamMemberPhotoArgs,
  MutationRemoveExperiencesArgs,
  MutationRemoveTeamMemberCapabilitiesArgs,
  MutationUpdateExperiencesArgs,
  MutationUpdateTeamMemberArgs,
  MutationUpdateTeamMemberCapabilitiesArgs,
  TeamMemberCapabilityInput,
} from "@/generated/graphql"
import { gql } from "@apollo/client"
import type { Language } from "@lumi/shared-contracts/language"

import { getAdminClient } from "@/lib/adminApiClient"
import type { TranslationInput } from "@/app/admin/components/translations/languages"

import { type TeamMemberFormSchema, type teamMemberOptionalContentFields } from "./components/form/schema"

// A team member as a save in a language sends it: content left untranslated outside English is null
type TeamMemberSaveInput = TranslationInput<TeamMemberFormSchema, (typeof teamMemberOptionalContentFields)[number]>

export async function createTeamMember(teamMember: TeamMemberFormSchema) {
  const client = await getAdminClient()

  const { data } = await client.mutate<Mutation, MutationCreateTeamMemberArgs>({
    mutation: gql`
      mutation CreateTeamMember($input: TeamMemberInput!) {
        createTeamMember(input: $input)
      }
    `,
    variables: {
      input: teamMember,
    },
  })

  revalidatePath("/admin/team-members", "layout")
  return data?.createTeamMember
}

// Saves the team member's content in the language (English by default), leaving other languages as they are. Only English
// saves the shared fields; the API requires them in every language but ignores them outside English
export async function updateTeamMember(id: string, teamMember: TeamMemberSaveInput, language?: Language) {
  const client = await getAdminClient()

  const { data } = await client.mutate<Mutation, MutationUpdateTeamMemberArgs>({
    mutation: gql`
      mutation UpdateTeamMember($id: ID!, $input: TeamMemberInput!, $language: String) {
        updateTeamMember(id: $id, input: $input, language: $language)
      }
    `,
    variables: {
      id,
      language,
      input: teamMember,
    },
  })

  revalidatePath("/admin/team-members", "layout")
  return data?.updateTeamMember
}

export async function deleteTeamMember(id: string) {
  const client = await getAdminClient()

  const { data } = await client.mutate<Mutation, MutationDeleteTeamMemberArgs>({
    mutation: gql`
      mutation DeleteTeamMember($id: ID!) {
        deleteTeamMember(id: $id)
      }
    `,
    variables: {
      id,
    },
  })

  revalidatePath("/admin/team-members", "layout")
  return data?.deleteTeamMember
}

export async function addExperiencesToTeamMember(teamMemberId: string, experiences: ExperienceInput[]) {
  const client = await getAdminClient()

  const { data } = await client.mutate<Mutation, MutationAddExperiencesToTeamMemberArgs>({
    mutation: gql`
      mutation AddExperienceToTeamMember($teamMemberId: ID!, $input: [ExperienceInput]!) {
        addExperiencesToTeamMember(teamMemberId: $teamMemberId, input: $input)
      }
    `,
    variables: {
      teamMemberId,
      input: experiences,
    },
  })

  revalidatePath(`/admin/team-members/${teamMemberId}`, "layout")
  return data?.addExperiencesToTeamMember
}

export async function removeExperiencesFromTeamMember(teamMemberId: string, experienceIds: string[]) {
  const client = await getAdminClient()

  const { data } = await client.mutate<Mutation, MutationRemoveExperiencesArgs>({
    mutation: gql`
      mutation RemoveExperiences($ids: [ID]!) {
        removeExperiences(ids: $ids)
      }
    `,
    variables: {
      ids: experienceIds,
    },
  })

  revalidatePath(`/admin/team-members/${teamMemberId}`, "layout")
  return data?.removeExperiences
}

// Saves the experiences' content in the language (English by default), and in English their shared fields too. Outside
// English an untranslated description is null
export async function updateTeamMemberExperiences(teamMemberId: string, experiences: ExperienceInput[], language?: Language) {
  const client = await getAdminClient()

  const { data } = await client.mutate<Mutation, MutationUpdateExperiencesArgs>({
    mutation: gql`
      mutation UpdateTeamMemberExperiences($input: [ExperienceInput]!, $language: String) {
        updateExperiences(input: $input, language: $language)
      }
    `,
    variables: {
      language,
      input: experiences,
    },
  })

  revalidatePath(`/admin/team-members/${teamMemberId}`, "layout")
  return data?.updateExperiences
}

export async function linkUploadToExperienceLogo(key: string, experienceId: string, teamMemberId: string) {
  const client = await getAdminClient()

  const { data } = await client.mutate<Mutation, MutationLinkUploadToExperienceLogoArgs>({
    mutation: gql`
      mutation LinkUploadToExperienceLogo($key: ID!, $experienceId: ID!) {
        linkUploadToExperienceLogo(key: $key, experienceId: $experienceId)
      }
    `,
    variables: {
      key,
      experienceId,
    },
  })

  revalidatePath(`/admin/team-members/${teamMemberId}`, "layout")
  return data?.linkUploadToExperienceLogo
}

export async function addCapabilitiesToTeamMember(teamMemberId: string, capabilities: TeamMemberCapabilityInput[]) {
  const client = await getAdminClient()

  const { data } = await client.mutate<Mutation, MutationAddCapabilitiesToTeamMemberArgs>({
    mutation: gql`
      mutation AddCapabilitiesToTeamMember($teamMemberId: ID!, $input: [TeamMemberCapabilityInput]!) {
        addCapabilitiesToTeamMember(teamMemberId: $teamMemberId, input: $input)
      }
    `,
    variables: {
      teamMemberId,
      input: capabilities,
    },
  })

  revalidatePath(`/admin/team-members/${teamMemberId}`, "layout")
  return data?.addCapabilitiesToTeamMember
}

export async function updateTeamMemberCapabilities(teamMemberId: string, capabilities: TeamMemberCapabilityInput[]) {
  const client = await getAdminClient()

  const { data } = await client.mutate<Mutation, MutationUpdateTeamMemberCapabilitiesArgs>({
    mutation: gql`
      mutation UpdateTeamMemberCapabilities($teamMemberId: ID!, $input: [TeamMemberCapabilityInput]!) {
        updateTeamMemberCapabilities(teamMemberId: $teamMemberId, input: $input)
      }
    `,
    variables: {
      teamMemberId,
      input: capabilities,
    },
  })

  revalidatePath(`/admin/team-members/${teamMemberId}`, "layout")
  return data?.updateTeamMemberCapabilities
}

export async function removeCapabilitiesFromTeamMember(teamMemberId: string, capabilityIds: string[]) {
  const client = await getAdminClient()

  const { data } = await client.mutate<Mutation, MutationRemoveTeamMemberCapabilitiesArgs>({
    mutation: gql`
      mutation RemoveCapabilities($teamMemberId: ID!, $ids: [ID]!) {
        removeTeamMemberCapabilities(teamMemberId: $teamMemberId, ids: $ids)
      }
    `,
    variables: {
      teamMemberId,
      ids: capabilityIds,
    },
  })

  revalidatePath(`/admin/team-members/${teamMemberId}`, "layout")
  return data?.removeTeamMemberCapabilities
}

export async function linkUploadToTeamMemberPhoto(key: string, teamMemberId: string) {
  const client = await getAdminClient()

  const { data } = await client.mutate<Mutation, MutationLinkUploadToTeamMemberPhotoArgs>({
    mutation: gql`
      mutation LinkUploadToTeamMemberPhoto($key: ID!, $teamMemberId: ID!) {
        linkUploadToTeamMemberPhoto(key: $key, teamMemberId: $teamMemberId)
      }
    `,
    variables: {
      key,
      teamMemberId,
    },
  })

  revalidatePath(`/admin/team-members/${teamMemberId}`, "layout")
  return data?.linkUploadToTeamMemberPhoto
}
