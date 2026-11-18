"use server"

import { revalidatePath } from "next/cache"
import type { Mutation, MutationCreateCapabilityArgs, MutationDeleteCapabilityArgs, MutationUpdateCapabilityArgs } from "@/generated/graphql"
import { gql } from "@apollo/client"
import type { Language } from "@lumi/shared-contracts/language"

import { getAdminClient } from "@/lib/adminApiClient"
import type { TranslationInput } from "@/app/admin/components/translations/languages"

import { type CapabilityFormSchema, type capabilityOptionalContentFields } from "./components/form/schema"

// A capability as a save in a language sends it: content left untranslated outside English is null
type CapabilitySaveInput = TranslationInput<CapabilityFormSchema, (typeof capabilityOptionalContentFields)[number]>

export async function createCapability(capability: CapabilityFormSchema) {
  const client = await getAdminClient()

  const { data } = await client.mutate<Mutation, MutationCreateCapabilityArgs>({
    mutation: gql`
      mutation CreateCapability($input: CapabilityInput!) {
        createCapability(input: $input)
      }
    `,
    variables: {
      input: capability,
    },
  })

  revalidatePath("/admin/capabilities", "layout")
  return data?.createCapability
}

// Saves the capability's content in the language (English by default), leaving other languages as they are
export async function updateCapability(id: string, capability: CapabilitySaveInput, language?: Language) {
  const client = await getAdminClient()

  const { data } = await client.mutate<Mutation, MutationUpdateCapabilityArgs>({
    mutation: gql`
      mutation UpdateCapability($id: ID!, $input: CapabilityInput!, $language: String) {
        updateCapability(id: $id, input: $input, language: $language)
      }
    `,
    variables: {
      id,
      language,
      input: capability,
    },
  })

  revalidatePath("/admin/capabilities", "layout")
  return data?.updateCapability
}

export async function deleteCapability(id: string) {
  const client = await getAdminClient()

  const { data } = await client.mutate<Mutation, MutationDeleteCapabilityArgs>({
    mutation: gql`
      mutation DeleteCapability($id: ID!) {
        deleteCapability(id: $id)
      }
    `,
    variables: {
      id,
    },
  })

  revalidatePath("/admin/capabilities", "layout")
  return data?.deleteCapability
}
