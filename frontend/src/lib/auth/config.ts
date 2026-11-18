import "server-only"

import { isPlaceholderSecret } from "@lumi/shared-contracts/secrets"

import { authMode } from "./mode"
import { SESSION_MAX_AGE_SECONDS } from "./session"

function list(value: string | undefined) {
  return (value || "")
    .split(",")
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean)
}

// Service account JSON key, base64-encoded; undefined when missing or invalid (which leaves admin sign-in unconfigured)
function serviceAccountKey(value: string | undefined) {
  if (!value) {
    return undefined
  }

  try {
    const { client_email, private_key } = JSON.parse(Buffer.from(value, "base64").toString("utf8"))
    if (typeof client_email === "string" && typeof private_key === "string") {
      return { clientEmail: client_email, privateKey: private_key }
    }
  } catch {}

  // Do not log the parse error: its message can quote part of the key
  console.error("[Auth]: GOOGLE_DIRECTORY_CREDENTIALS is not a base64-encoded service account JSON key")
  return undefined
}

// Shortest NEXTAUTH_SECRET accepted: it signs and encrypts the admin session cookies, so a short one could be guessed
export const MIN_AUTH_SECRET_LENGTH = 32

// What's wrong with NEXTAUTH_SECRET and how to fix it, or undefined when it's fine. A placeholder or short secret would let
// anyone who guesses it forge an admin session
export function authSecretProblem(secret = authConfig.secret.trim()) {
  const fix = "generate one with `openssl rand -base64 32`"
  if (!secret) return `NEXTAUTH_SECRET is not set: ${fix}`
  if (isPlaceholderSecret(secret)) return `NEXTAUTH_SECRET is still the placeholder from deploy/.env.example: ${fix}`
  if (secret.length < MIN_AUTH_SECRET_LENGTH) return `NEXTAUTH_SECRET is shorter than ${MIN_AUTH_SECRET_LENGTH} characters: ${fix}`
  return undefined
}

// Admin sign-in configuration, server-side only. Missing values deny admin access (see isAuthConfigured). Only the settings
// of the mode in ADMIN_AUTH_PROVIDER (lib/auth/mode.ts) are needed: the Google ones for workspace, the secret for local
const mode = authMode()

export const authConfig = {
  mode,
  secret: process.env.NEXTAUTH_SECRET || "",
  google: {
    clientId: process.env.GOOGLE_CLIENT_ID || "",
    clientSecret: process.env.GOOGLE_CLIENT_SECRET || "",
  },
  // Workspace domains whose accounts may sign in, checked against the validated `hd` claim of the Google identity
  allowedDomains: list(process.env.ADMIN_ALLOWED_DOMAINS),
  // Google Group (email or ID) whose direct or same-domain nested members are admins
  adminGroup: (process.env.ADMIN_GOOGLE_GROUP || "").trim(),
  directory: {
    // Key of the service account with domain-wide delegation for the Directory read-only member scope
    key: mode === "workspace" ? serviceAccountKey(process.env.GOOGLE_DIRECTORY_CREDENTIALS) : undefined,
    // Workspace user the service account impersonates; needs permission to read the group's members
    impersonatedUser: (process.env.GOOGLE_DIRECTORY_IMPERSONATED_USER || "").trim(),
  },
  // Maximum age of a positive group membership check before it is checked again with Google
  membershipCacheMs: 5 * 60 * 1000,
  // Maximum age of a negative check, short so that new members get access quickly
  nonMembershipCacheMs: 30 * 1000,
  sessionMaxAgeSeconds: SESSION_MAX_AGE_SECONDS,
}

// Whether admins can sign in: a valid mode, a secret and everything that mode needs. The placeholder secret is public, so it
// signs nobody in. A short one still works, so an existing installation isn't locked out, but the health check reports it
export function isAuthConfigured() {
  const { mode, secret, google, allowedDomains, adminGroup, directory } = authConfig
  if (!secret.trim() || isPlaceholderSecret(secret)) return false
  if (mode === "local") return true
  if (mode !== "workspace") return false
  return Boolean(google.clientId && google.clientSecret && allowedDomains.length && adminGroup && directory.key && directory.impersonatedUser)
}

export function isAllowedDomain(hd: string | undefined) {
  return Boolean(hd) && authConfig.allowedDomains.includes(hd!.toLowerCase())
}
