"use server"

import { revalidatePath, updateTag } from "next/cache"
import type { KnowledgeSources, Mutation, MutationUpdateStructuredSourcesArgs } from "@/generated/graphql"
import { gql } from "@apollo/client"
import type { SourceLabels, StructuredSources } from "@lumi/shared-contracts/knowledge"

import { getAdminClient } from "@/lib/adminApiClient"
import { apiErrorOf } from "@/lib/auth/localAccounts"
import { KNOWLEDGE_SOURCES_TAG } from "@/lib/chatSources"

// A label the API refused, by field ("labels.teamMembers.plural"), for the form to show next to it
export type StructuredSourcesProblem = { field: string; message: string }

export type SaveStructuredSourcesResult =
  { ok: true; sources: KnowledgeSources } | { ok: false; problems: StructuredSourcesProblem[] } | { ok: false; error: string }

// Turns the structured sources on or off and names them. The admin layout is revalidated so the navigation and every admin
// page show only the ones that are on, by their labels, and the chat pages so their built-in starters follow them
export async function updateStructuredSources({
  teamMembers,
  projects,
  clients,
  capabilities,
  jobOpenings,
  labels,
}: StructuredSources & { labels: SourceLabels }): Promise<SaveStructuredSourcesResult> {
  const client = await getAdminClient()

  try {
    const { data } = await client.mutate<Mutation, MutationUpdateStructuredSourcesArgs>({
      mutation: gql`
        mutation UpdateStructuredSources($input: StructuredSourcesInput!) {
          updateStructuredSources(input: $input) {
            teamMembers
            projects
            clients
            capabilities
            jobOpenings
            labels {
              teamMembers {
                singular
                plural
              }
              projects {
                singular
                plural
              }
              clients {
                singular
                plural
              }
              capabilities {
                singular
                plural
              }
              jobOpenings {
                singular
                plural
              }
            }
            saved
          }
        }
      `,
      variables: { input: { teamMembers, projects, clients, capabilities, jobOpenings, labels } },
      fetchPolicy: "no-cache",
    })
    if (!data?.updateStructuredSources) throw new Error("The API answered without data")
    revalidatePath("/admin", "layout")
    updateTag(KNOWLEDGE_SOURCES_TAG)
    revalidatePath("/chat/[lang]", "page")
    revalidatePath("/widget/[lang]", "layout")
    return { ok: true, sources: data.updateStructuredSources }
  } catch (error) {
    const refusal = apiErrorOf(error)
    if (refusal?.code === "BAD_USER_INPUT" && Array.isArray(refusal.extensions.problems)) {
      return { ok: false, problems: refusal.extensions.problems as StructuredSourcesProblem[] }
    }
    console.error("Saving the knowledge sources failed", refusal?.code ?? (error as Error).message)
    return { ok: false, error: "The knowledge sources couldn't be saved. Try again in a moment." }
  }
}
