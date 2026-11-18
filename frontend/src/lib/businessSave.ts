import "server-only"

import { revalidatePath, updateTag } from "next/cache"
import type { FirstAdminInput, Mutation, MutationSetupBusinessArgs, MutationUpdateBusinessSettingsArgs } from "@/generated/graphql"
import { gql, type ApolloClient } from "@apollo/client"
import { CombinedGraphQLErrors } from "@apollo/client/errors"
import {
  BusinessSettingsError,
  parseBusinessSettings,
  type BusinessSettingsInput,
  type BusinessSettingsProblem,
} from "@lumi/shared-contracts/business"

import { BUSINESS_TAG } from "@/lib/business"
import { graphQLInput } from "@/lib/businessSettings"
import { firstAdminProblems } from "@/lib/firstAdmin"

// Saving the business settings, from the onboarding wizard (setupBusiness) and the admin settings (updateBusinessSettings)

export type SaveBusinessResult =
  | { ok: true }
  // Problems by field, for the form to show next to each
  | { ok: false; problems: BusinessSettingsProblem[] }
  // ALREADY_SET_UP: the wizard ran meanwhile. NOT_SET_UP: an update before it ran. ADMIN_EXISTS: the wizard gave a first admin
  // but the installation already has one
  | { ok: false; code: "ALREADY_SET_UP" | "NOT_SET_UP" | "ADMIN_EXISTS" }
  | { ok: false; error: string }

const MUTATIONS = {
  setupBusiness: gql`
    mutation SetupBusiness($input: BusinessSettingsInput!, $firstAdmin: FirstAdminInput) {
      setupBusiness(input: $input, firstAdmin: $firstAdmin) {
        updatedAt
      }
    }
  `,
  updateBusinessSettings: gql`
    mutation UpdateBusinessSettings($input: BusinessSettingsInput!) {
      updateBusinessSettings(input: $input) {
        updatedAt
      }
    }
  `,
}

// Checks the settings as the backend will, then saves them. The API's own problems and refusals come back as results.
// firstAdmin: the onboarding wizard's first admin (local sign-in mode), created with the settings. The password only travels
// in the variables
export async function saveBusiness(
  client: ApolloClient,
  mutation: keyof typeof MUTATIONS,
  settings: BusinessSettingsInput,
  firstAdmin?: FirstAdminInput
): Promise<SaveBusinessResult> {
  const problems = firstAdmin ? firstAdminProblems(firstAdmin) : []
  try {
    parseBusinessSettings(settings)
  } catch (error) {
    if (!(error instanceof BusinessSettingsError)) throw error
    problems.unshift(...error.problems)
  }
  if (problems.length) return { ok: false, problems }

  try {
    await client.mutate<Mutation, MutationSetupBusinessArgs | MutationUpdateBusinessSettingsArgs>({
      mutation: MUTATIONS[mutation],
      variables: { input: graphQLInput(settings), ...(firstAdmin && { firstAdmin }) },
    })
  } catch (error) {
    if (CombinedGraphQLErrors.is(error)) {
      const extensions = error.errors[0]?.extensions
      if (extensions?.code === "BAD_USER_INPUT" && Array.isArray(extensions.problems)) {
        return { ok: false, problems: extensions.problems as BusinessSettingsProblem[] }
      }
      if (extensions?.code === "ALREADY_SET_UP" || extensions?.code === "NOT_SET_UP" || extensions?.code === "ADMIN_EXISTS") {
        return { ok: false, code: extensions.code }
      }
    }
    console.error(`Couldn't save the business settings (${mutation})`, error)
    return { ok: false, error: "The settings couldn't be saved: the server didn't answer. Try again in a moment." }
  }

  expireBusiness()
  return { ok: true }
}

// The next request for the chat pages, the widget's settings and anything else that read the settings gets the saved ones.
// Only in server actions
export function expireBusiness() {
  updateTag(BUSINESS_TAG)
  revalidatePath("/chat/[lang]", "page")
  revalidatePath("/widget/[lang]", "layout")
}
