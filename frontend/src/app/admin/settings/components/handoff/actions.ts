"use server"

import { revalidatePath } from "next/cache"
import type { HandoffSettings, HandoffSettingsInput, Mutation, MutationUpdateHandoffSettingsArgs } from "@/generated/graphql"
import { gql } from "@apollo/client"
import type { HandoffSettingsProblem } from "@lumi/shared-contracts/handoff"

import { getAdminClient } from "@/lib/adminApiClient"
import { apiErrorOf } from "@/lib/auth/localAccounts"

import { HANDOFF_SETTINGS_FIELDS } from "./query"

export type SaveHandoffResult =
  // The saved settings, with the keys given to new channels and the webhook secrets redacted
  | { ok: true; settings: HandoffSettings }
  // Problems by field ("channels.1.url"), for the form to show next to each
  | { ok: false; problems: HandoffSettingsProblem[] }
  | { ok: false; error: string }

// Replaces every qualification and handoff setting. The API checks them as the form did, and keeps a webhook's saved secret
// when the form sends none
export async function updateHandoff(input: HandoffSettingsInput): Promise<SaveHandoffResult> {
  const client = await getAdminClient()

  try {
    const { data } = await client.mutate<Mutation, MutationUpdateHandoffSettingsArgs>({
      mutation: gql`
        mutation UpdateHandoffSettings($input: HandoffSettingsInput!) {
          updateHandoffSettings(input: $input) {
            ...HandoffSettingsFields
          }
        }
        ${HANDOFF_SETTINGS_FIELDS}
      `,
      variables: { input },
      fetchPolicy: "no-cache",
    })
    if (!data?.updateHandoffSettings) throw new Error("The API answered without data")
    revalidatePath("/admin/settings")
    return { ok: true, settings: data.updateHandoffSettings }
  } catch (error) {
    const refusal = apiErrorOf(error)
    if (refusal?.code === "BAD_USER_INPUT" && Array.isArray(refusal.extensions.problems)) {
      return { ok: false, problems: refusal.extensions.problems as HandoffSettingsProblem[] }
    }
    console.error("Saving the handoff settings failed", refusal?.code ?? (error as Error).message)
    return { ok: false, error: "The settings couldn't be saved: the server didn't answer. Try again in a moment." }
  }
}
