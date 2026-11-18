export const ADMIN_HOME = "/admin"
export const SIGN_IN_PATH = "/auth/signin"
export const AUTH_ERROR_PATH = "/auth/error"
// Local mode only: where admins choose a new password, and must before using the admin after a temporary one
export const CHANGE_PASSWORD_PATH = "/auth/change-password"

export type AuthErrorCode =
  | "Configuration"
  | "AccessDenied"
  // Workspace mode
  | "EmailNotVerified"
  | "DomainNotAllowed"
  | "NotMember"
  | "MembershipCheckFailed"
  // Local mode: NextAuth's own code for a wrong email or password
  | "CredentialsSignin"
  // Too many failed sign-ins for the email or the network
  | "RateLimited"
  // The API couldn't check the email and password
  | "CredentialsCheckFailed"
  // The session's account was removed
  | "AccountRemoved"
  // The API couldn't look the session's account up
  | "AccountCheckFailed"

export function authErrorPath(error: AuthErrorCode) {
  return `${AUTH_ERROR_PATH}?error=${error}`
}

// Only admin paths of this site are valid return paths after sign-in. Relative paths are accepted, and so are absolute URLs of
// `origin` (the site's own origin), which NextAuth passes when it sends users back to the sign-in page itself
export function safeCallbackUrl(value: string | null | undefined, origin?: string) {
  if (!value) {
    return ADMIN_HOME
  }

  try {
    const base = new URL(origin || "http://localhost")
    const url = new URL(value, base)
    const isRelative = value.startsWith("/") && !value.startsWith("//") && !value.startsWith("/\\")
    if ((isRelative || origin) && url.origin === base.origin && (url.pathname === ADMIN_HOME || url.pathname.startsWith(`${ADMIN_HOME}/`))) {
      return `${url.pathname}${url.search}`
    }
  } catch {}

  return ADMIN_HOME
}

export function signInPath(callbackUrl?: string) {
  return `${SIGN_IN_PATH}?callbackUrl=${encodeURIComponent(safeCallbackUrl(callbackUrl))}`
}
