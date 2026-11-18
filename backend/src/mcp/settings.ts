import { decodeServiceAccountKey } from "@/utils/serviceAccountKey"

// How the MCP server's team sign-in reads its settings, without side effects: shared by its configuration (config.ts) and the
// container's startup check (src/container/config.ts), so both agree on what turns sign-in on

// How team members sign in, from ADMIN_AUTH_PROVIDER as the web app reads it: "workspace" (Google Workspace accounts in the
// team's Google Group) or "local" (the installation's email and password admin accounts, src/services/adminAccounts.ts). Null
// when unset or any other value, which turns sign-in off rather than pick a method
export type AuthProvider = "workspace" | "local"

export function parseAuthProvider(value: string | undefined): AuthProvider | null {
  const normalized = (value || "").trim().toLowerCase()
  if (normalized === "workspace") return "workspace"
  if (normalized === "local") return "local"
  return null
}

// What team members sign in with, for messages that ask them to
export function signInWith(provider: AuthProvider | null | undefined): string {
  if (provider === "local") return "your Lumi admin account"
  return provider === "workspace" ? "your team's Google Workspace account" : "an admin account"
}

// The settings Google Workspace sign-in needs, with whether each is usable. GOOGLE_DIRECTORY_CREDENTIALS must decode as a
// service account key with domain-wide delegation for the Directory read-only member scope
export function workspaceSignInSettings(env: NodeJS.ProcessEnv): [name: string, usable: boolean][] {
  const set = (name: string) => Boolean(env[name]?.trim())
  return [
    ["MCP_GOOGLE_CLIENT_ID", set("MCP_GOOGLE_CLIENT_ID")],
    ["MCP_GOOGLE_CLIENT_SECRET", set("MCP_GOOGLE_CLIENT_SECRET")],
    ["ADMIN_ALLOWED_DOMAINS", (env.ADMIN_ALLOWED_DOMAINS || "").split(",").some((domain) => domain.trim())],
    ["ADMIN_GOOGLE_GROUP", set("ADMIN_GOOGLE_GROUP")],
    ["GOOGLE_DIRECTORY_CREDENTIALS", decodeServiceAccountKey(env.GOOGLE_DIRECTORY_CREDENTIALS) !== undefined],
    ["GOOGLE_DIRECTORY_IMPERSONATED_USER", set("GOOGLE_DIRECTORY_IMPERSONATED_USER")],
  ]
}

// The names of the Google Workspace sign-in settings that are missing or invalid
export const missingWorkspaceSignInSettings = (env: NodeJS.ProcessEnv) =>
  workspaceSignInSettings(env)
    .filter(([, usable]) => !usable)
    .map(([name]) => name)

// The token secret's minimum length, below which team sign-in stays off
export const MIN_TOKEN_SECRET_LENGTH = 32
