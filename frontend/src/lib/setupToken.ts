import "server-only"

import { createHash, createHmac, timingSafeEqual } from "node:crypto"
import { cookies, headers } from "next/headers"
import { isPlaceholderSecret } from "@lumi/shared-contracts/secrets"

import { authMode } from "./auth/mode"

// The setup token that protects the onboarding wizard (/setup). Its operator sets LUMI_SETUP_TOKEN on the server, read on
// each request and never sent to the browser. Set, the wizard first asks for it, then keeps the visitor's access in a
// short-lived cookie derived from it. Unset, the wizard is open to anyone until the business is set up, except in local
// sign-in mode (ADMIN_AUTH_PROVIDER=local): there the wizard creates the first admin, so it can't be completed without a token

const VARIABLE = "LUMI_SETUP_TOKEN"
export const MIN_SETUP_TOKEN_LENGTH = 16
const COOKIE = "lumi_setup_access"
const COOKIE_MAX_AGE_SECONDS = 60 * 60

// open: no token. locked/unlocked: whether this visitor gave it. misconfigured: a token too short to protect anything, or the
// deploy/.env.example placeholder. missing: local sign-in mode without a token, so nobody can complete the wizard
export type SetupGate = "open" | "locked" | "unlocked" | "misconfigured" | "missing"

// The configured token, or undefined when the wizard is open. A token too short or the placeholder is reported as such
function configuredToken(): { token: string } | "misconfigured" | undefined {
  const token = process.env[VARIABLE]?.trim()
  if (!token) return undefined
  if (isPlaceholderSecret(token)) {
    console.warn(`${VARIABLE} is still the placeholder from deploy/.env.example, so the onboarding wizard accepts no token`)
    return "misconfigured"
  }
  if (token.length < MIN_SETUP_TOKEN_LENGTH) {
    console.warn(`${VARIABLE} is shorter than ${MIN_SETUP_TOKEN_LENGTH} characters, so the onboarding wizard accepts no token`)
    return "misconfigured"
  }
  return { token }
}

const sha256 = (value: string) => createHash("sha256").update(value).digest()

// Compares the hashes, so both sides have the same length and the time doesn't depend on where they differ
const sameText = (a: string, b: string) => timingSafeEqual(sha256(a), sha256(b))

// "<expiry>.<signature>": the expiry, signed with the token, so the cookie holds nothing that reveals it, stops working
// when it expires and when the token changes
function accessValue(token: string, expires: number) {
  return `${expires}.${createHmac("sha256", token).update(`lumi-setup-access:${expires}`).digest("base64url")}`
}

function hasValidAccess(token: string, value: string | undefined) {
  const expires = Number(value?.split(".")[0])
  if (!value || !Number.isInteger(expires) || expires < Date.now()) return false
  return sameText(value, accessValue(token, expires))
}

// The wizard's state for this request
export async function setupGate(): Promise<SetupGate> {
  const configured = configuredToken()
  if (!configured) return authMode() === "local" ? "missing" : "open"
  if (configured === "misconfigured") return "misconfigured"
  return hasValidAccess(configured.token, (await cookies()).get(COOKIE)?.value) ? "unlocked" : "locked"
}

// Whether this request may set the business up: no token outside local sign-in mode, or a valid access cookie for the current one
export async function hasSetupAccess() {
  const gate = await setupGate()
  return gate === "open" || gate === "unlocked"
}

// Whether the visitor reached the app over https, so the access cookie can be Secure. Browsers drop a Secure cookie set over
// plain http, which would lock out an installation served without TLS, e.g. on a private network. Next.js sets
// x-forwarded-proto from the connection when no proxy in front of it does; the first entry is the visitor's
async function isHttps() {
  const protocol = (await headers()).get("x-forwarded-proto")?.split(",")[0]?.trim()
  return protocol !== "http"
}

export type UnlockResult = { ok: true } | { ok: false; error: string }

// Checks a token the visitor entered and, when it matches, gives them access to the wizard for an hour
export async function unlockSetup(entered: string): Promise<UnlockResult> {
  const configured = configuredToken()
  if (!configured) {
    return authMode() === "local" ? { ok: false, error: "Setup is unavailable: the server has no setup token." } : { ok: true }
  }
  if (configured === "misconfigured")
    return { ok: false, error: "Setup is unavailable: the server's setup token is too short or still the example placeholder." }

  if (!sameText(entered.trim(), configured.token)) {
    // Slows down guessing
    await new Promise((resolve) => setTimeout(resolve, 500))
    return { ok: false, error: "That setup token isn't right." }
  }

  const expires = Date.now() + COOKIE_MAX_AGE_SECONDS * 1000
  ;(await cookies()).set(COOKIE, accessValue(configured.token, expires), {
    httpOnly: true,
    secure: await isHttps(),
    sameSite: "strict",
    path: "/setup",
    maxAge: COOKIE_MAX_AGE_SECONDS,
  })
  return { ok: true }
}
