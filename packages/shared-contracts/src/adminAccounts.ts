import { z } from "zod"

// The admin accounts of an installation that signs its admins in with an email and a password (ADMIN_AUTH_PROVIDER=local on
// the web app) rather than with Google Workspace. The setup wizard creates the first, admins add the others in the admin
// settings, and the backend's admin:reset script recovers access. The web app's forms and the backend check them with these
// same rules; only the backend stores and verifies passwords

export const MIN_ADMIN_PASSWORD_LENGTH = 12
export const MAX_ADMIN_PASSWORD_LENGTH = 256

// How an account's email is stored and looked up, so it signs in however the admin types its case
export const normalizeAdminEmail = (email: string) => email.trim().toLowerCase()

export const adminEmailSchema = z
  .string({ error: "Enter an email address, e.g. admin@example.com" })
  .transform(normalizeAdminEmail)
  .pipe(z.email("Enter an email address, e.g. admin@example.com").max(254, "Too long: at most 254 characters"))

// Lengths are counted in characters (code points), so an emoji counts once. A code point takes one or two UTF-16 units, so
// they are only counted when the string's length leaves it open: an over-long input is never split into characters
const hasAtLeast = (value: string, count: number) => value.length >= 2 * count || [...value].length >= count
const hasAtMost = (value: string, count: number) => value.length <= count || (value.length <= 2 * count && [...value].length <= count)

// Whether a password is longer than any allowed one, so it can't match an account
export const exceedsAdminPasswordLength = (password: string) => !hasAtMost(password, MAX_ADMIN_PASSWORD_LENGTH)

// Passwords are taken exactly as typed: never trimmed, and without complexity rules
export const adminPasswordSchema = z
  .string({ error: "Enter a password" })
  .refine((password) => hasAtLeast(password, MIN_ADMIN_PASSWORD_LENGTH), `Too short: at least ${MIN_ADMIN_PASSWORD_LENGTH} characters`)
  .refine((password) => !exceedsAdminPasswordLength(password), `Too long: at most ${MAX_ADMIN_PASSWORD_LENGTH} characters`)

// Optional: trimmed, with an empty or null name unset
export const adminNameSchema = z.preprocess(
  (value) => (value === null ? undefined : typeof value === "string" ? value.trim() || undefined : value),
  z.string().max(100, "Too long: at most 100 characters").optional()
)
