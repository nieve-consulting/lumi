"use server"

import { revalidatePath } from "next/cache"
import type {
  JobOpeningInput,
  Mutation,
  MutationCreateJobOpeningArgs,
  MutationDeleteJobOpeningArgs,
  MutationUpdateJobOpeningArgs,
} from "@/generated/graphql"
import { gql } from "@apollo/client"
import type { Language } from "@lumi/shared-contracts/language"

import { getAdminClient } from "@/lib/adminApiClient"
import type { TranslationInput } from "@/app/admin/components/translations/languages"

import { type JobOpeningFormSchema, type jobOpeningOptionalContentFields } from "./components/form/schema"

// A job opening as a save in a language sends it: content left untranslated outside English is null
type JobOpeningSaveInput = TranslationInput<JobOpeningFormSchema, (typeof jobOpeningOptionalContentFields)[number]>

// The API's input: without an application link, candidates are pointed to the careers page
const toInput = ({ application_url, ...jobOpening }: JobOpeningSaveInput): JobOpeningInput => ({
  ...jobOpening,
  application_url: application_url.trim() || null,
})

export async function createJobOpening(jobOpening: JobOpeningFormSchema) {
  const client = await getAdminClient()

  const { data } = await client.mutate<Mutation, MutationCreateJobOpeningArgs>({
    mutation: gql`
      mutation ($input: JobOpeningInput!) {
        createJobOpening(input: $input)
      }
    `,
    variables: {
      input: toInput(jobOpening),
    },
  })

  revalidatePath("/admin/job-openings", "layout")
  return data?.createJobOpening
}

// Saves the job opening's content in the language (English by default), leaving other languages as they are. Only English
// saves the shared fields; the API requires them in every language but ignores them outside English
export async function updateJobOpening(id: string, jobOpening: JobOpeningSaveInput, language?: Language) {
  const client = await getAdminClient()

  const { data } = await client.mutate<Mutation, MutationUpdateJobOpeningArgs>({
    mutation: gql`
      mutation ($id: ID!, $input: JobOpeningInput!, $language: String) {
        updateJobOpening(id: $id, input: $input, language: $language)
      }
    `,
    variables: {
      id,
      language,
      input: toInput(jobOpening),
    },
  })

  revalidatePath("/admin/job-openings", "layout")
  return data?.updateJobOpening
}

export async function deleteJobOpening(id: string) {
  const client = await getAdminClient()

  const { data } = await client.mutate<Mutation, MutationDeleteJobOpeningArgs>({
    mutation: gql`
      mutation ($id: ID!) {
        deleteJobOpening(id: $id)
      }
    `,
    variables: {
      id,
    },
  })

  revalidatePath("/admin/job-openings", "layout")
  return data?.deleteJobOpening
}
