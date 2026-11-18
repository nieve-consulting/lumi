import "server-only"

import { unstable_cache } from "next/cache"
import type { Query } from "@/generated/graphql"
import { gql } from "@apollo/client"
import { parseBusinessSettings, type PublicBusinessConfig } from "@lumi/shared-contracts/business"

import { getClient } from "@/lib/apiClient"
import { settingsFromGraphQL } from "@/lib/businessSettings"

// The cache tag of the business settings. Saving them (the onboarding wizard, the admin settings) expires it, which also
// expires the prerendered chat pages that read them
export const BUSINESS_TAG = "business"

// Only the public settings: the agent fields are the backend's and the admins'. Uncached: most callers want getBusiness
export async function fetchPublicBusiness(): Promise<PublicBusinessConfig | null> {
  const { data } = await getClient().query<Query>({
    query: gql`
      query PublicBusinessSettings {
        publicBusinessSettings {
          businessName
          websiteUrl
          careersUrl
          contactUrl
          contactEmail
          contactPhone
          assistantName
          avatarUrl
          logoUrl
          primaryColor
          defaultLanguage
          starters {
            icon
            label {
              language
              text
            }
            message {
              language
              text
            }
          }
          greeting {
            language
            text
          }
          updatedAt
        }
      }
    `,
    fetchPolicy: "no-cache",
  })
  const settings = data?.publicBusinessSettings
  // Stored values come back as entered, so parsing fills the defaults the way the backend and the widget read them
  return settings ? parseBusinessSettings(settingsFromGraphQL(settings)).public : null
}

// The business this installation represents, or null until the onboarding wizard has run. Cached until a save expires
// BUSINESS_TAG, and refreshed hourly in the background in case the settings changed another way, e.g. a restored database.
// An unreachable API throws and nothing is cached; a background refresh that fails keeps the cached settings
const getCachedBusiness = unstable_cache(fetchPublicBusiness, ["public-business-settings"], { tags: [BUSINESS_TAG], revalidate: 3600 })

// The cached settings, or a fresh read when the cache has none. Until the onboarding wizard runs, the proxy sends every page
// but the widget's to it, so this mostly serves the widget and /api/business then; afterwards it covers a cache that missed
// the setup, e.g. one made by another server process, without sending the chat back to the wizard
export async function getBusiness(): Promise<PublicBusinessConfig | null> {
  return (await getCachedBusiness()) ?? fetchPublicBusiness()
}

// Whether the cache still holds settings the API no longer has, e.g. after the record was deleted outside the app
export async function hasStaleBusiness() {
  return (await getCachedBusiness().catch(() => null)) !== null
}

// An image of the business on the Lumi web app (a path such as /media/logo.png) as an absolute URL for renderers outside
// the browser, e.g. the resume PDF's
export function absoluteImageUrl(url: string, baseUrl: string) {
  return url.startsWith("/") ? new URL(url, baseUrl).toString() : url
}
