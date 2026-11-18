import "server-only"

import { cache } from "react"
import type { KnowledgeSources, Query } from "@/generated/graphql"
import { gql } from "@apollo/client"
import type { SourceLabels } from "@lumi/shared-contracts/knowledge"

import { getAdminClient } from "@/lib/adminApiClient"
import { labelsOf } from "@/lib/knowledgeSources"

// The structured sources that are on and their labels, or undefined when they couldn't be loaded. Once per request, as the
// layout, its page and the page's metadata all read them
export const getKnowledgeSources = cache(async (): Promise<KnowledgeSources | undefined> => {
  const client = await getAdminClient()

  try {
    const { data } = await client.query<Query>({
      query: gql`
        query KnowledgeSources {
          knowledgeSources {
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
      fetchPolicy: "no-cache",
    })
    return data?.knowledgeSources
  } catch (error) {
    console.error("Loading the knowledge sources failed", (error as Error).message)
    return undefined
  }
})

// The structured sources' labels for server pages, the defaults when they couldn't be loaded
export async function getSourceLabels(): Promise<SourceLabels> {
  return labelsOf(await getKnowledgeSources())
}
