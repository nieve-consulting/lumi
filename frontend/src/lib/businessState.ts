import { DEFAULT_LANGUAGE, matchLanguage, type Language } from "@lumi/shared-contracts/language"

import { serverConfig } from "@/lib/serverConfig"

// Whether the installation is set up, and its default language, for the proxy, which can't use the pages' tagged cache
// (see lib/business.ts). It asks the API directly, keeping "set up" per server process for a minute so an admin's language
// change applies within it. "Not set up" is never kept: each request checks again, so the first one after the onboarding
// wizard finishes goes through

export type BusinessState = { setUp: true; defaultLanguage: Language } | { setUp: false }

const SET_UP_TTL_MS = 60_000

let setUp: { defaultLanguage: Language; checkedAt: number } | undefined
let checking: Promise<BusinessState | undefined> | undefined

// Undefined when the API doesn't answer or errs: the caller lets the request through so the page reports it
async function fetchState(): Promise<BusinessState | undefined> {
  try {
    // The API the GraphQL client uses (lib/apiClient.ts), which the proxy can't share
    const response = await fetch(`${serverConfig.apiEndpoint}/graphql`, {
      method: "POST",
      headers: { "Content-Type": "application/json", authorization: serverConfig.apiKey },
      body: JSON.stringify({ query: "query { publicBusinessSettings { defaultLanguage } }" }),
      cache: "no-store",
      signal: AbortSignal.timeout(3_000),
    })
    const { data, errors } = await response.json()
    if (!response.ok || errors?.length || !data) throw new Error(`The API answered ${response.status}: ${JSON.stringify(errors ?? data)}`)
    const settings = data.publicBusinessSettings
    return settings ? { setUp: true, defaultLanguage: matchLanguage(settings.defaultLanguage) ?? DEFAULT_LANGUAGE } : { setUp: false }
  } catch (error) {
    console.warn("Couldn't check whether the business is set up", error)
    return undefined
  }
}

// One check at a time; what it finds replaces the kept state, except an error, which leaves it
function check() {
  checking ??= fetchState().then((state) => {
    if (state?.setUp) setUp = { defaultLanguage: state.defaultLanguage, checkedAt: Date.now() }
    else if (state) setUp = undefined
    checking = undefined
    return state
  })
  return checking
}

// A kept "set up" answers at once, refreshing in the background once it's a minute old
export async function businessState(): Promise<BusinessState | undefined> {
  if (setUp) {
    if (Date.now() - setUp.checkedAt > SET_UP_TTL_MS) void check()
    return { setUp: true, defaultLanguage: setUp.defaultLanguage }
  }
  return check()
}
