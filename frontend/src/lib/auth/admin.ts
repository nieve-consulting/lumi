import "server-only"

import { cache } from "react"
import { notFound, redirect } from "next/navigation"
import { connection } from "next/server"
import { getServerSession } from "next-auth"

import { authConfig, isAllowedDomain, isAuthConfigured } from "./config"
import { isAdminGroupMember } from "./directory"
import { findAdminAccount } from "./localAccounts"
import { matchesMode } from "./mode"
import { authOptions } from "./options"
import { authErrorPath, CHANGE_PASSWORD_PATH, signInPath, type AuthErrorCode } from "./paths"
import { isSessionExpired } from "./session"

export interface AdminUser {
  id: string
  email: string
  name?: string | null
  image?: string | null
}

type AdminAccess =
  | { status: "granted"; user: AdminUser }
  // Local mode: the account has a temporary password, and must choose a new one before using the admin
  | { status: "passwordChangeRequired"; user: AdminUser }
  | { status: "unauthenticated" }
  | { status: "forbidden"; error: AuthErrorCode }
  | { status: "unavailable"; error: AuthErrorCode }

// Local mode: the session's account must still exist, looked up on every privileged request so a removal, a password change
// or a reset takes effect at once. A session from before the password was last set grants nothing: it signs in again
async function localAccess(id: string, passwordChangedAt: string | undefined): Promise<AdminAccess> {
  try {
    const account = await findAdminAccount(id)
    if (!account) return { status: "forbidden", error: "AccountRemoved" }
    if (account.passwordChangedAt !== passwordChangedAt) return { status: "unauthenticated" }
    const user = { id: account.id, email: account.email, name: account.name }
    return account.mustChangePassword ? { status: "passwordChangeRequired", user } : { status: "granted", user }
  } catch (error) {
    console.error(`[Auth]: Looking up the admin account of a session failed: ${(error as Error).message}`)
    return { status: "unavailable", error: "AccountCheckFailed" }
  }
}

// Checks the session, then the admin Google Group membership (cached for a few minutes) in workspace mode or the account in
// local mode, once per server request
export const getAdminAccess = cache(async (): Promise<AdminAccess> => {
  // Always answered for a request, never while the app is built. A page with nothing else request-specific, such as a "new"
  // form, would otherwise be prerendered where the sign-in settings are missing, and keep that render's redirect to the
  // sign-in error for every request
  await connection()

  if (!isAuthConfigured()) {
    return { status: "unavailable", error: "Configuration" }
  }

  // Missing, expired or tampered session cookies give no session; sessions also end a fixed time after sign-in. A session
  // from the other sign-in mode grants nothing
  const session = await getServerSession(authOptions)
  const user = session?.user
  if (!user?.id || !user.email || isSessionExpired(session?.signedInAt) || !matchesMode(session?.provider, authConfig.mode)) {
    return { status: "unauthenticated" }
  }
  if (authConfig.mode === "local") {
    return localAccess(user.id, session?.passwordChangedAt)
  }
  if (!isAllowedDomain(user.hd)) {
    return { status: "forbidden", error: "DomainNotAllowed" }
  }

  try {
    if (!(await isAdminGroupMember(user.id))) {
      return { status: "forbidden", error: "NotMember" }
    }
  } catch {
    return { status: "unavailable", error: "MembershipCheckFailed" }
  }

  return { status: "granted", user: { id: user.id, email: user.email, name: user.name, image: user.image } }
})

// Guard for admin pages and server actions: redirects to the sign-in or error page unless the user is an admin. The proxy
// already sends page requests without a session to the sign-in page with their own return path
export async function requireAdminAccess() {
  const access = await getAdminAccess()
  switch (access.status) {
    case "granted":
      return access.user
    case "unauthenticated":
      redirect(signInPath())
    case "passwordChangeRequired":
      redirect(CHANGE_PASSWORD_PATH)
    default:
      redirect(authErrorPath(access.error))
  }
}

// Guard for the change-password page and its action (local mode only): the signed-in admin, including one who must change a
// temporary password before anything else, and whether they must
export async function requirePasswordChangeAccess() {
  if (authConfig.mode !== "local") notFound()
  const access = await getAdminAccess()
  switch (access.status) {
    case "granted":
      return { user: access.user, required: false }
    case "passwordChangeRequired":
      return { user: access.user, required: true }
    case "unauthenticated":
      redirect(signInPath())
    default:
      redirect(authErrorPath(access.error))
  }
}

// Guard for admin route handlers that need the admin: the admin, or the response to return when the user is not one
export async function adminRouteAccess(): Promise<{ user: AdminUser; error?: undefined } | { user?: undefined; error: Response }> {
  const access = await getAdminAccess()
  switch (access.status) {
    case "granted":
      return { user: access.user }
    case "unauthenticated":
      return { error: Response.json({ error: "Sign in to continue." }, { status: 401 }) }
    case "forbidden":
      return { error: Response.json({ error: "Your account does not have admin access." }, { status: 403 }) }
    case "passwordChangeRequired":
      return { error: Response.json({ error: "Change your password to continue." }, { status: 403 }) }
    default:
      return { error: Response.json({ error: "Admin access could not be verified. Try again in a moment." }, { status: 503 }) }
  }
}

// Guard for admin route handlers: the response to return when the user is not an admin, otherwise undefined
export async function adminRouteError() {
  return (await adminRouteAccess()).error
}
