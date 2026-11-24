// The Lumi version this installation runs and whether a newer release is published, for the admin interface (Query.lumiVersion)
// and the status command, so operators learn of an upgrade without watching GitHub. The check is one anonymous request to
// GitHub's API from the server: it sends nothing about the installation, not even its version. LUMI_UPDATE_CHECK=off turns it
// off for installations that must not contact GitHub, and then no request is made at all

export const UPDATE_CHECK_VARIABLE = "LUMI_UPDATE_CHECK"

// GitHub's latest release leaves out drafts and prereleases, so only a release operators should upgrade to is offered
const LATEST_RELEASE_URL = "https://api.github.com/repos/nieve-consulting/lumi/releases/latest"
// GitHub refuses requests without a User-Agent. A fixed one, so it tells GitHub nothing about the installation
const USER_AGENT = "Lumi update check"
const REQUEST_TIMEOUT_MS = 5_000

// Releases come a few times a month, and GitHub allows an address 60 anonymous requests an hour: twice a day is plenty, and an
// installation that can't reach GitHub tries again hourly rather than on every admin page
const SUCCESS_TTL_MS = 12 * 60 * 60 * 1000
const FAILURE_TTL_MS = 60 * 60 * 1000

// The version the image was built from (backend/Dockerfile), such as 0.62.0, or local for a Compose build from a checkout
export const lumiVersion = () => process.env.LUMI_VERSION?.trim() || "unknown"

// LUMI_UPDATE_CHECK: on (the default, also when unset or empty) or off. undefined for any other value, which validateConfig
// refuses at startup (src/container/config.ts)
export function updateCheckSetting(): "on" | "off" | undefined {
  const value = process.env[UPDATE_CHECK_VARIABLE]?.trim()
  if (!value || value === "on") return "on"
  if (value === "off") return "off"
  return undefined
}

export interface LumiRelease {
  version: string
  url: string
  // ISO 8601
  publishedAt: string
}

export type LumiVersionState = { current: string } & (
  | { check: "OK"; latest: LumiRelease; updateAvailable: boolean }
  | { check: "OFF"; latest: null; updateAvailable: false }
  // Why the latest release couldn't be read, for operators; it holds no secrets
  | { check: "UNAVAILABLE"; latest: null; updateAvailable: false; reason: string }
)

type Lookup = { release: LumiRelease } | { reason: string }

const RELEASE_VERSION = /^(\d+)\.(\d+)\.(\d+)$/

// Whether `latest` is a newer release than `current`, both X.Y.Z. False when either isn't one, such as local or unknown, as
// such a build can't be placed among the releases
export function isNewerRelease(latest: string, current: string) {
  const latestParts = RELEASE_VERSION.exec(latest)?.slice(1).map(Number)
  const currentParts = RELEASE_VERSION.exec(current)?.slice(1).map(Number)
  if (!latestParts || !currentParts) return false

  for (let index = 0; index < 3; index++) {
    if (latestParts[index] !== currentParts[index]) return latestParts[index] > currentParts[index]
  }
  return false
}

function describeFetchError(error: unknown) {
  if (error instanceof Error && error.name === "TimeoutError") return `GitHub didn't answer within ${REQUEST_TIMEOUT_MS / 1000} seconds`
  // Node's fetch fails with "fetch failed" and the network error, such as ENOTFOUND or ECONNREFUSED, as its cause
  const cause = (error as { cause?: { code?: string; message?: string } }).cause
  const detail = cause?.code ?? cause?.message ?? (error instanceof Error ? error.message : String(error))
  return `GitHub couldn't be reached (${detail})`
}

function describeStatus(response: Response) {
  // Anonymous requests share the address's hourly allowance with anything else on it that calls GitHub's API
  if ((response.status === 403 || response.status === 429) && response.headers.get("x-ratelimit-remaining") === "0") {
    return `GitHub's rate limit for this server's address is used up (HTTP ${response.status})`
  }
  if (response.status === 404) return "GitHub has no published Lumi release (HTTP 404)"
  return `GitHub answered HTTP ${response.status}`
}

// The release from GitHub's answer, or undefined when it isn't shaped as a release is
function parseRelease(body: unknown): LumiRelease | undefined {
  const { tag_name, html_url, published_at } = (body ?? {}) as Record<string, unknown>
  if (typeof tag_name !== "string" || typeof html_url !== "string" || typeof published_at !== "string") return undefined

  const version = tag_name.trim().replace(/^v/, "")
  // The admin interface links it, so only a release page on GitHub is passed on
  const url = URL.parse(html_url)
  const published = new Date(published_at)
  if (!version || url?.protocol !== "https:" || url.hostname !== "github.com" || Number.isNaN(published.getTime())) return undefined

  return { version, url: url.href, publishedAt: published.toISOString() }
}

async function fetchLatestRelease(logFailure: boolean): Promise<Lookup> {
  let reason: string
  try {
    const response = await fetch(LATEST_RELEASE_URL, {
      headers: { Accept: "application/vnd.github+json", "User-Agent": USER_AGENT, "X-GitHub-Api-Version": "2022-11-28" },
      // Also bounds reading the body
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    })
    if (response.ok) {
      const release = parseRelease(await response.json().catch(() => undefined))
      if (release) return { release }
      reason = "GitHub's answer wasn't the release expected"
    } else {
      reason = describeStatus(response)
    }
  } catch (error) {
    reason = describeFetchError(error)
  }

  if (logFailure) console.warn(`Couldn't check for a newer Lumi release, trying again in an hour: ${reason}`)
  return { reason }
}

let cached: { lookup: Lookup; expiresAt: number } | undefined
let inFlight: Promise<Lookup> | undefined

// One request at a time, however many callers ask meanwhile
function refresh(logFailure: boolean) {
  inFlight ??= fetchLatestRelease(logFailure)
    .then((lookup) => {
      cached = { lookup, expiresAt: Date.now() + ("release" in lookup ? SUCCESS_TTL_MS : FAILURE_TTL_MS) }
      return lookup
    })
    .finally(() => {
      inFlight = undefined
    })
  return inFlight
}

// The admin interface asks on every page, so once anything is cached it answers at once: an expired answer is still given
// while a fresh one is fetched in the background. Only the first call in a process waits for GitHub
function latestRelease(logFailure: boolean): Promise<Lookup> {
  if (!cached) return refresh(logFailure)
  if (Date.now() >= cached.expiresAt) void refresh(logFailure)
  return Promise.resolve(cached.lookup)
}

let reportedInvalidSetting = false

// Never throws: a check that fails is UNAVAILABLE, with the reason. `logFailure: false` for a caller that reports the reason
// itself, as the status command does
export async function lumiVersionState({ logFailure = true }: { logFailure?: boolean } = {}): Promise<LumiVersionState> {
  const current = lumiVersion()

  const setting = updateCheckSetting()
  if (setting === "off") return { current, check: "OFF", latest: null, updateAvailable: false }
  // Outside the container (pnpm dev:apollo) nothing refuses it at startup, so it is reported here, once
  if (setting === undefined && !reportedInvalidSetting) {
    reportedInvalidSetting = true
    console.warn(`${UPDATE_CHECK_VARIABLE} must be "on" (the default) or "off", so the update check stays on: set it to off to turn it off`)
  }

  const lookup = await latestRelease(logFailure)
  if ("reason" in lookup) return { current, check: "UNAVAILABLE", latest: null, updateAvailable: false, reason: lookup.reason }
  return { current, check: "OK", latest: lookup.release, updateAvailable: isNewerRelease(lookup.release.version, current) }
}
