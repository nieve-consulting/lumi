"use server"

import { revalidatePath } from "next/cache"
import type { CompanyInput, Mutation, MutationUpdateCompanyArgs } from "@/generated/graphql"
import { gql } from "@apollo/client"
import type { BusinessSettingsInput } from "@lumi/shared-contracts/business"
import type { Language } from "@lumi/shared-contracts/language"

import { getAdminClient } from "@/lib/adminApiClient"
import { saveBusiness, type SaveBusinessResult } from "@/lib/businessSave"

// Saves the company's content in the language (English by default), leaving other languages as they are. Only English
// saves the shared fields; other languages need the company saved in English first and ignore them
export async function updateCompany(company: CompanyInput, language?: Language) {
  const client = await getAdminClient()

  const { data } = await client.mutate<Mutation, MutationUpdateCompanyArgs>({
    mutation: gql`
      mutation UpdateCompany($input: CompanyInput!, $language: String) {
        updateCompany(input: $input, language: $language)
      }
    `,
    variables: {
      input: company,
      language,
    },
  })

  revalidatePath("/admin/settings", "layout")
  return data?.updateCompany
}

// Saves every business setting, including the agent's private guidance. Fails with NOT_SET_UP before the onboarding wizard
// has run
export async function updateBusiness(settings: BusinessSettingsInput): Promise<SaveBusinessResult> {
  return saveBusiness(await getAdminClient(), "updateBusinessSettings", settings)
}
