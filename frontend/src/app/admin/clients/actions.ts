"use server"

import { revalidatePath } from "next/cache"
import type {
  Mutation,
  MutationCreateClientArgs,
  MutationDeleteClientArgs,
  MutationLinkUploadToClientLogoArgs,
  MutationUpdateClientArgs,
} from "@/generated/graphql"
import { gql } from "@apollo/client"
import type { Language } from "@lumi/shared-contracts/language"

import { getAdminClient } from "@/lib/adminApiClient"
import type { TranslationInput } from "@/app/admin/components/translations/languages"

import { type ClientFormSchema, type clientOptionalContentFields } from "./components/form/schema"

// A client as a save in a language sends it: content left untranslated outside English is null
type ClientSaveInput = TranslationInput<ClientFormSchema, (typeof clientOptionalContentFields)[number]>

export async function createClient(client: ClientFormSchema) {
  const apiClient = await getAdminClient()

  const { data } = await apiClient.mutate<Mutation, MutationCreateClientArgs>({
    mutation: gql`
      mutation ($input: ClientInput!) {
        createClient(input: $input)
      }
    `,
    variables: {
      input: client,
    },
  })

  revalidatePath("/admin/clients", "layout")
  return data?.createClient
}

// Saves the client's content in the language (English by default), leaving other languages as they are. Only English saves
// the shared fields; the API requires them in every language but ignores them outside English
export async function updateClient(id: string, client: ClientSaveInput, language?: Language) {
  const apiClient = await getAdminClient()

  const { data } = await apiClient.mutate<Mutation, MutationUpdateClientArgs>({
    mutation: gql`
      mutation ($id: ID!, $input: ClientInput!, $language: String) {
        updateClient(id: $id, input: $input, language: $language)
      }
    `,
    variables: {
      id,
      language,
      input: client,
    },
  })

  revalidatePath("/admin/clients", "layout")
  return data?.updateClient
}

export async function deleteClient(id: string) {
  const client = await getAdminClient()

  const { data } = await client.mutate<Mutation, MutationDeleteClientArgs>({
    mutation: gql`
      mutation ($id: ID!) {
        deleteClient(id: $id)
      }
    `,
    variables: {
      id,
    },
  })

  revalidatePath("/admin/clients", "layout")
  return data?.deleteClient
}

export async function linkUploadToClientLogo(key: string, clientId: string) {
  const client = await getAdminClient()

  const { data } = await client.mutate<Mutation, MutationLinkUploadToClientLogoArgs>({
    mutation: gql`
      mutation LinkUploadToClientLogo($key: ID!, $clientId: ID!) {
        linkUploadToClientLogo(key: $key, clientId: $clientId)
      }
    `,
    variables: {
      key,
      clientId,
    },
  })

  revalidatePath(`/admin/clients/${clientId}`, "layout")
  return data?.linkUploadToClientLogo
}
