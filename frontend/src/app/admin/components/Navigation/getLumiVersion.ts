import "server-only"

import { cache } from "react"
import type { LumiVersion, Query } from "@/generated/graphql"
import { gql } from "@apollo/client"

import { getAdminClient } from "@/lib/adminApiClient"

// The version this installation runs and whether a newer release exists, or undefined when it couldn't be loaded, e.g.
// from a backend without the field. Once per request, as the side menu and the mobile drawer both show it. The backend
// caches the release check, so this doesn't reach GitHub on every page
export const getLumiVersion = cache(async (): Promise<LumiVersion | undefined> => {
  // Outside the try, so its redirect to sign-in isn't caught as a failure
  const client = await getAdminClient()

  try {
    const { data } = await client.query<Query>({
      query: gql`
        query LumiVersion {
          lumiVersion {
            current
            check
            latest {
              version
              url
              publishedAt
            }
            updateAvailable
          }
        }
      `,
      fetchPolicy: "no-cache",
    })
    return data?.lumiVersion
  } catch (error) {
    console.error("Loading the Lumi version failed", (error as Error).message)
    return undefined
  }
})
