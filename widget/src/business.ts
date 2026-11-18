import { baseLanguage, type Language } from "./i18n"

// The installation's public business settings the launcher uses, fetched when the widget loads so admins' edits apply
// without rebuilding the widget. Written from the response format WidgetBusinessResponse in @lumi/shared-contracts/business
// describes, which the widget, built apart from the pnpm workspace and under its own license, can't import or copy:
// GET <origin>/api/business answers
//   { configured: false } until the installation's onboarding is completed, or
//   { configured: true, assistantName, defaultLanguage, primaryColor? }
export interface WidgetBusiness {
  assistantName: string
  // A base language code; the launcher's labels fall back to it when they have none for the visitor's language
  defaultLanguage: Language
  // #rrggbb, dark enough for white text. Unset leaves the launcher uncoloured
  primaryColor?: string
}

// Neutral settings for when the installation can't be asked: Lumi's own name, English and no colour
export const DEFAULT_BUSINESS: WidgetBusiness = { assistantName: "Lumi", defaultLanguage: "en" }

export const BUSINESS_TIMEOUT_MS = 3000

export type BusinessResult =
  | { status: "configured"; business: WidgetBusiness }
  | { status: "unconfigured" }
  // The origin has no /api/business, so it isn't a Lumi installation, e.g. a CDN serving a copy of the bundle: no launcher
  | { status: "notLumi" }
  // The installation didn't answer in time, couldn't be reached or answered something else: the launcher uses the defaults
  | { status: "unavailable"; reason: string }

// Reads the response, rejecting anything that isn't the contract's shape so a broken or unexpected answer can't put odd
// text or styles on the host page
export function parseBusiness(data: unknown): BusinessResult {
  if (typeof data !== "object" || data === null) return { status: "unavailable", reason: "the response isn't a JSON object" }
  const { configured, assistantName, defaultLanguage, primaryColor } = data as Record<string, unknown>

  if (configured === false) return { status: "unconfigured" }
  if (configured !== true) return { status: "unavailable", reason: "the response has no configured flag" }

  const name = typeof assistantName === "string" ? assistantName.trim() : ""
  if (!name || name.length > 100) return { status: "unavailable", reason: "the response has no valid assistantName" }
  const language = baseLanguage(defaultLanguage)
  if (!language) return { status: "unavailable", reason: "the response has no valid defaultLanguage" }
  if (primaryColor !== undefined && (typeof primaryColor !== "string" || !/^#[0-9a-f]{6}$/i.test(primaryColor))) {
    return { status: "unavailable", reason: "the response's primaryColor isn't a #rrggbb colour" }
  }

  return { status: "configured", business: { assistantName: name, defaultLanguage: language, primaryColor } }
}

// Asks the installation for its settings, giving up after BUSINESS_TIMEOUT_MS. Resolves to undefined when the caller aborts.
// A plain controller and timer rather than AbortSignal.any, which older browsers on host pages lack
export async function fetchBusiness(origin: string, signal: AbortSignal): Promise<BusinessResult | undefined> {
  const controller = new AbortController()
  const abort = () => controller.abort()
  signal.addEventListener("abort", abort)
  let timedOut = false
  const timer = setTimeout(() => {
    timedOut = true
    controller.abort()
  }, BUSINESS_TIMEOUT_MS)

  try {
    const response = await fetch(new URL("/api/business", origin), {
      signal: controller.signal,
      credentials: "omit",
      headers: { Accept: "application/json" },
    })
    if (response.status === 404) return { status: "notLumi" }
    if (!response.ok) return { status: "unavailable", reason: `it answered HTTP ${response.status}` }
    let data: unknown
    try {
      data = await response.json()
    } catch (error) {
      if (controller.signal.aborted) throw error
      return { status: "unavailable", reason: "the response isn't JSON" }
    }
    return parseBusiness(data)
  } catch (error) {
    if (signal.aborted) return undefined
    if (timedOut) return { status: "unavailable", reason: `it didn't answer within ${BUSINESS_TIMEOUT_MS / 1000} s` }
    return { status: "unavailable", reason: `the request failed (${error instanceof Error ? error.message : String(error)})` }
  } finally {
    clearTimeout(timer)
    signal.removeEventListener("abort", abort)
  }
}
