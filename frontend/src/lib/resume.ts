import "server-only"

import { unstable_cache } from "next/cache"
import type { Query, ResumeSettings } from "@/generated/graphql"
import { gql } from "@apollo/client"
import { parseResumeSettings, ResumeSettingsError, type ResumeConfig, type ResumeSettingsInput } from "@lumi/shared-contracts/resume"

import { getClient } from "@/lib/apiClient"

// The resume settings (Settings → Resumes): whether Lumi offers team member resumes, and the logo, colours and footer text of the PDF.
//
// Lumi offers resumes only when it can confirm they're on. While the API can't say, e.g. it's unreachable or its database
// hasn't been migrated yet, the admin links no resume and the resume route refuses to serve one, rather than serve resumes an
// admin may have turned off. The prerendered chat pages keep their links as last rendered instead (chatOffersResumes)

// The cache tag of the resume settings. Saving them expires it, which also expires the prerendered chat pages that read them
export const RESUME_TAG = "resume-settings"

// The fields every reader takes: the settings as entered, null where unset
export const RESUME_SETTINGS_FIELDS = gql`
  fragment ResumeSettingsFields on ResumeSettings {
    enabled
    logoUrl
    headerColor
    accentColor
    gradientColor
    footerText
    updatedAt
  }
`

// The stored settings as parseResumeSettings takes them
export const resumeSettingsInput = ({
  enabled,
  logoUrl,
  headerColor,
  accentColor,
  gradientColor,
  footerText,
}: ResumeSettings): ResumeSettingsInput => ({
  enabled,
  logoUrl,
  headerColor,
  accentColor,
  gradientColor,
  footerText,
})

// The settings with their defaults filled in. Stored settings the shared checks no longer accept, e.g. after the contrast rules
// were tightened, keep whether resumes are on and fall back to the defaults (no logo, neutral colours, no footer text), so a
// resume still renders readably
export function resumeConfigOf(settings: ResumeSettings): ResumeConfig {
  try {
    return parseResumeSettings(resumeSettingsInput(settings))
  } catch (error) {
    if (!(error instanceof ResumeSettingsError)) throw error
    console.error("The stored resume settings are invalid, so resumes use the defaults", error.message)
    return parseResumeSettings({ enabled: settings.enabled })
  }
}

// The settings, read from the API now. Throws while the API can't say. The resume route uses it, so turning resumes off
// applies to the next download on every server
export async function fetchResumeConfig(): Promise<ResumeConfig> {
  const { data } = await getClient().query<Query>({
    query: gql`
      query ResumeSettings {
        resumeSettings {
          ...ResumeSettingsFields
        }
      }
      ${RESUME_SETTINGS_FIELDS}
    `,
    fetchPolicy: "no-cache",
  })
  if (!data?.resumeSettings) throw new Error("The API answered without the resume settings")
  return resumeConfigOf(data.resumeSettings)
}

// Cached until a save expires RESUME_TAG, and refreshed hourly in the background in case the settings changed another way.
// An unreachable API throws and nothing is cached; a background refresh that fails keeps the cached settings
const getCachedResumeConfig = unstable_cache(fetchResumeConfig, ["resume-settings"], { tags: [RESUME_TAG], revalidate: 3600 })

// The cached settings, or undefined while the API can't say
export async function getResumeConfig(): Promise<ResumeConfig | undefined> {
  try {
    return await getCachedResumeConfig()
  } catch (error) {
    console.error("Couldn't read the resume settings, so resumes aren't offered", (error as Error).message)
    return undefined
  }
}

// Whether the admin links resumes: only while they're on, and not while the API can't say
export async function offersResumes() {
  return (await getResumeConfig())?.enabled ?? false
}

// Whether the prerendered chat pages link resumes. Throws while the API can't say, like getBusiness, so a regeneration that
// fails keeps serving the page as last rendered rather than prerendering it without resume links until the next refresh
export async function chatOffersResumes() {
  return (await getCachedResumeConfig()).enabled
}
