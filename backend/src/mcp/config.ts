// MCP server configuration, read from the environment (see src/mcp/README.md). On Lambda, MCP_SECRET_PARAMETERS names SSM
// SecureString parameters the function reads into the environment at start (src/mcp/lambda/mcp.ts)

import { decodeServiceAccountKey } from "@/utils/serviceAccountKey"

import { MIN_TOKEN_SECRET_LENGTH, missingWorkspaceSignInSettings, parseAuthProvider, type AuthProvider } from "./settings"

export type { AuthProvider } from "./settings"

export const SCOPES = { read: "lumi:read", write: "lumi:write" } as const
export type Scope = (typeof SCOPES)[keyof typeof SCOPES]
export const SUPPORTED_SCOPES: Scope[] = [SCOPES.read, SCOPES.write]

// Contract version of the tool definitions, bumped deliberately when a tool's schema or behavior changes
export const CONTRACT_VERSION = "2026-11-09.1"

function list(value: string | undefined) {
  return (value || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean)
}

// Logged once when the configuration loads, so an operator sees why team sign-in is off
function authProvider(): AuthProvider | undefined {
  const provider = parseAuthProvider(process.env.ADMIN_AUTH_PROVIDER)
  if (provider) return provider

  const value = process.env.ADMIN_AUTH_PROVIDER?.trim()
  console.error(
    `[MCP]: ADMIN_AUTH_PROVIDER is ${value ? `"${value}", which is not "workspace" or "local"` : `not set: set it to "workspace" or "local"`}, so team sign-in is off`
  )
  return undefined
}

// Service account JSON key, base64-encoded, with domain-wide delegation for the Directory read-only member scope
function directoryKey(value: string | undefined) {
  const key = decodeServiceAccountKey(value)
  if (value?.trim() && !key) console.error("[MCP]: GOOGLE_DIRECTORY_CREDENTIALS is not a base64-encoded service account JSON key")
  return key
}

function readConfig() {
  const baseUrl = (process.env.MCP_BASE_URL || "http://localhost:4300").replace(/\/+$/, "")
  const adminGroup = (process.env.ADMIN_GOOGLE_GROUP || "").trim()

  return {
    authProvider: authProvider(),
    // The Google Workspace sign-in settings that are missing or invalid (settings.ts)
    missingWorkspaceSettings: missingWorkspaceSignInSettings(process.env),
    // The web app, where admins of local sign-in choose a new password (its /auth/change-password page). The MCP server's own
    // origin when unset: the container installation serves both on the same one
    appBaseUrl: (process.env.APP_BASE_URL || "").trim().replace(/\/+$/, "") || baseUrl,
    // Public origin of the MCP server and its authorization server, e.g. https://api.example.com
    baseUrl,
    // The authorization server's issuer, and the protected resource (audience of the access tokens)
    issuer: baseUrl,
    resource: `${baseUrl}/mcp`,
    resourceMetadataUrl: `${baseUrl}/.well-known/oauth-protected-resource/mcp`,
    // Secret every signed value derives its key from: access tokens, authorization requests, login state
    tokenSecret: process.env.MCP_TOKEN_SECRET || "",
    google: {
      clientId: process.env.MCP_GOOGLE_CLIENT_ID || "",
      clientSecret: process.env.MCP_GOOGLE_CLIENT_SECRET || "",
    },
    // Workspace domains whose accounts may sign in, checked against the validated `hd` claim
    allowedDomains: list(process.env.ADMIN_ALLOWED_DOMAINS).map((domain) => domain.toLowerCase()),
    // Google Group (email or id) of the team: its members may read Lumi records. The same group as the admin interface
    readGroup: adminGroup,
    // Members of this group may also write; the read group when unset
    writeGroup: (process.env.MCP_WRITE_GOOGLE_GROUP || "").trim() || adminGroup,
    directory: {
      key: directoryKey(process.env.GOOGLE_DIRECTORY_CREDENTIALS),
      impersonatedUser: (process.env.GOOGLE_DIRECTORY_IMPERSONATED_USER || "").trim(),
    },
    // Origins OAuth clients may redirect to (e.g. https://chatgpt.com). Empty allows any https redirect URI
    allowedRedirectOrigins: list(process.env.MCP_ALLOWED_REDIRECT_ORIGINS),
    // Allows http://localhost and http://127.0.0.1 redirect URIs, for local tools such as the MCP Inspector
    allowLoopbackRedirects: process.env.MCP_ALLOW_LOOPBACK_REDIRECTS === "true",
    accessTokenTtlSeconds: 60 * 60,
    refreshTokenTtlSeconds: 30 * 24 * 60 * 60,
    // A rotated refresh token still works this long, for concurrent refreshes and retries after a lost response
    refreshTokenReuseGraceSeconds: 60,
    authorizationCodeTtlSeconds: 5 * 60,
    // Time to approve and sign in after the authorization request
    loginTtlSeconds: 10 * 60,
    // Group membership results are reused for this long, like in the admin interface
    membershipCacheMs: 5 * 60 * 1000,
    nonMembershipCacheMs: 30 * 1000,
    // Per caller and minute. Server-side clients such as ChatGPT send every user's anonymous MCP calls and token requests from a
    // few shared addresses, so those per-address limits are sized for many users behind one address
    rateLimits: {
      anonymousPerMinute: 600,
      userPerMinute: 120,
      tokenPerMinute: 300,
      oauthPerMinute: 30,
      registrationsPerMinute: 5,
    },
  }
}

export const mcpConfig = readConfig()

// Logged once when the configuration loads: without an allowlist, a client anyone registers could have an admin sign in and
// receive their access
if (mcpConfig.allowedRedirectOrigins.length === 0) {
  console.warn(
    "[MCP]: MCP_ALLOWED_REDIRECT_ORIGINS is empty, so any https client can register and request sign-in. Set it to the origins of the clients you use, e.g. https://chatgpt.com"
  )
}

// Whether the protected tools and the authorization server can work. Public tools work without it. Local sign-in only needs
// the token secret; Google Workspace sign-in needs every Google setting
export function isAuthConfigured() {
  const { authProvider, tokenSecret, missingWorkspaceSettings } = mcpConfig
  if (tokenSecret.length < MIN_TOKEN_SECRET_LENGTH) return false
  return authProvider === "local" || (authProvider === "workspace" && missingWorkspaceSettings.length === 0)
}
