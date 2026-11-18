"use server"

import { revalidatePath, updateTag } from "next/cache"
import type { Mutation, MutationUpdateResumeSettingsArgs, ResumeSettings, ResumeSettingsInput } from "@/generated/graphql"
import { gql } from "@apollo/client"
import { parseResumeSettings, ResumeSettingsError, type ResumeSettingsProblem } from "@lumi/shared-contracts/resume"

import { getAdminClient } from "@/lib/adminApiClient"
import { apiErrorOf } from "@/lib/auth/localAccounts"
import { RESUME_SETTINGS_FIELDS, RESUME_TAG } from "@/lib/resume"

export type SaveResumeResult =
  // The saved settings, as stored
  | { ok: true; settings: ResumeSettings }
  // Problems by field ("accentColor"), for the form to show next to each
  | { ok: false; problems: ResumeSettingsProblem[] }
  | { ok: false; error: string }

// Replaces every resume setting, checked as the form and the API check them. The chat pages, the team members list and the
// resume route read the saved settings from the next request
export async function updateResumes(input: ResumeSettingsInput): Promise<SaveResumeResult> {
  try {
    parseResumeSettings(input)
  } catch (error) {
    if (error instanceof ResumeSettingsError) return { ok: false, problems: error.problems }
    throw error
  }

  const client = await getAdminClient()
  try {
    const { data } = await client.mutate<Mutation, MutationUpdateResumeSettingsArgs>({
      mutation: gql`
        mutation UpdateResumeSettings($input: ResumeSettingsInput!) {
          updateResumeSettings(input: $input) {
            ...ResumeSettingsFields
          }
        }
        ${RESUME_SETTINGS_FIELDS}
      `,
      variables: { input },
      fetchPolicy: "no-cache",
    })
    if (!data?.updateResumeSettings) throw new Error("The API answered without data")
    updateTag(RESUME_TAG)
    // The chat pages link resumes only while they're on
    revalidatePath("/chat/[lang]", "page")
    revalidatePath("/widget/[lang]", "layout")
    revalidatePath("/admin", "layout")
    return { ok: true, settings: data.updateResumeSettings }
  } catch (error) {
    const refusal = apiErrorOf(error)
    if (refusal?.code === "BAD_USER_INPUT" && Array.isArray(refusal.extensions.problems)) {
      return { ok: false, problems: refusal.extensions.problems as ResumeSettingsProblem[] }
    }
    console.error("Saving the resume settings failed", refusal?.code ?? (error as Error).message)
    return { ok: false, error: "The resume settings couldn't be saved: the server didn't answer. Try again in a moment." }
  }
}
