import "server-only"

import { unstable_cache } from "next/cache"
import type { Query } from "@/generated/graphql"
import { gql } from "@apollo/client"

import { getClient } from "@/lib/apiClient"

// Which structured sources the chat's built-in starters may point visitors to: "Explore our work" needs projects, "Find job
// opportunities" job openings. A business that sets its own starters doesn't use these

// The cache tag of the structured source switches. Saving them expires it, which also expires the prerendered chat pages
export const KNOWLEDGE_SOURCES_TAG = "knowledge-sources"

export interface StarterSources {
  projects: boolean
  jobOpenings: boolean
}

async function fetchStarterSources(): Promise<StarterSources> {
  const { data } = await getClient().query<Query>({
    query: gql`
      query ChatStarterSources {
        knowledgeSources {
          projects
          jobOpenings
        }
      }
    `,
    fetchPolicy: "no-cache",
  })
  const sources = data?.knowledgeSources
  if (!sources) throw new Error("The API answered without the knowledge sources")
  return { projects: sources.projects, jobOpenings: sources.jobOpenings }
}

// Cached until a save expires KNOWLEDGE_SOURCES_TAG, and refreshed hourly in the background in case they changed another way.
// Throws while the API can't say, like getBusiness, so a regeneration that fails keeps serving the page as last rendered
export const chatStarterSources = unstable_cache(fetchStarterSources, ["chat-starter-sources"], {
  tags: [KNOWLEDGE_SOURCES_TAG],
  revalidate: 3600,
})
