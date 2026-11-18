// How admins sign in, from ADMIN_AUTH_PROVIDER on the server: "workspace" (Google Workspace accounts in the admin Google Group)
// or "local" (email and password accounts kept by the API). Unset or anything else leaves admin sign-in unavailable, never
// open. No secrets here, so the proxy can read it too

export type AuthMode = "workspace" | "local"

// The NextAuth provider each mode signs in with, kept in the session so a session from the other mode grants nothing
export type SessionProvider = "google" | "local"

const VARIABLE = "ADMIN_AUTH_PROVIDER"
const MODES: readonly AuthMode[] = ["workspace", "local"]

// On globalThis, as the proxy and each server bundle load their own copy of this module
const state = globalThis as { lumiAuthModeReported?: boolean }

// The configured mode, or undefined (logged once per server process) when it is unset or invalid
export function authMode(): AuthMode | undefined {
  const value = process.env[VARIABLE]?.trim().toLowerCase()
  const mode = MODES.find((candidate) => candidate === value)
  if (!mode && !state.lumiAuthModeReported) {
    state.lumiAuthModeReported = true
    console.error(
      `[Auth]: ${VARIABLE} is ${value ? `"${value}", which is not a sign-in mode` : "not set"}. Set it to "workspace" or "local": admin sign-in is unavailable until then`
    )
  }
  return mode
}

export function providerOfMode(mode: AuthMode): SessionProvider {
  return mode === "local" ? "local" : "google"
}

// Sessions from before sign-in modes existed have no provider; they all came from Google
export function sessionProvider(provider: unknown): SessionProvider | undefined {
  if (provider === undefined) return "google"
  return provider === "google" || provider === "local" ? provider : undefined
}

// Whether a session's provider is the current mode's: any other session grants nothing
export function matchesMode(provider: unknown, mode: AuthMode | undefined) {
  return Boolean(mode) && sessionProvider(provider) === providerOfMode(mode!)
}
