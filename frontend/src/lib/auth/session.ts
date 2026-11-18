// Sessions end this long after sign-in. NextAuth issues a new cookie with a later expiry whenever /api/auth/session is
// called, so the sign-in time kept in the token enforces the limit
export const SESSION_MAX_AGE_SECONDS = 12 * 60 * 60

// Whether a session signed in at `signedInAt` (seconds since the epoch) has ended; sessions without a sign-in time have
export function isSessionExpired(signedInAt: unknown) {
  return typeof signedInAt !== "number" || Date.now() / 1000 - signedInAt > SESSION_MAX_AGE_SECONDS
}
