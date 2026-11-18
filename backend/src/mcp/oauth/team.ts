import type { Queryable } from "@/services/db"
import { pgError } from "@/services/errors"
import { adminAccounts } from "@db/schema"
import { eq } from "drizzle-orm"

import { mcpConfig } from "../config"
import { teamPermissions as googleTeamPermissions, MembershipCheckError } from "./directory"

// The team permissions behind every protected MCP call, checked at sign-in, at every refresh and on every protected tool call,
// for the sign-in method of ADMIN_AUTH_PROVIDER (config.ts):
// - workspace: membership of the team's Google Groups (directory.ts)
// - local: the Lumi admin account the user signed in with. Every admin reads and writes, as in the admin interface. Access ends
//   once the account is removed, or its password is changed or reset after the sign-in: the time of sign-in, carried by the
//   access token and kept on the authorization code and refresh tokens (signed_in_at), is compared with the account's
//   password_changed_at. Both are written by the backend's clock (adminAccounts.ts sets password_changed_at itself)
// A check that can't be completed throws MembershipCheckError, which callers answer with "try again"

// Users of local sign-in are `local:<admin account id>`; Google account ids are digits only, so the two never collide
const LOCAL_SUB_PREFIX = "local:"
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export const localSub = (accountId: string) => `${LOCAL_SUB_PREFIX}${accountId}`
export const isLocalSub = (sub: string) => sub.startsWith(LOCAL_SUB_PREFIX)

export interface TeamUser {
  sub: string
  // When the user signed in, in milliseconds: needed by local sign-in
  signedInAt?: number
}

export type TeamPermissions = { read: boolean; write: boolean }

const NONE: TeamPermissions = { read: false, write: false }

async function localPermissions(db: Queryable, { sub, signedInAt }: TeamUser): Promise<TeamPermissions> {
  const id = sub.slice(LOCAL_SUB_PREFIX.length)
  if (!isLocalSub(sub) || !UUID.test(id) || signedInAt === undefined) return NONE

  let account
  try {
    ;[account] = await db
      .select({ password_changed_at: adminAccounts.password_changed_at, must_change_password: adminAccounts.must_change_password })
      .from(adminAccounts)
      .where(eq(adminAccounts.id, id))
  } catch (error) {
    // Not the error itself: a query error quotes its parameters
    console.error("[MCP]: The admin account check failed:", pgError(error)?.code ?? "no error code")
    throw new MembershipCheckError("The admin account check failed")
  }

  if (!account || account.must_change_password || account.password_changed_at.getTime() > signedInAt) return NONE
  return { read: true, write: true }
}

// The user's current team permissions, by the sign-in method in use. A user of the other method has none
export async function teamPermissions(db: Queryable, user: TeamUser): Promise<TeamPermissions> {
  switch (mcpConfig.authProvider) {
    case "local":
      return localPermissions(db, user)
    case "workspace":
      return isLocalSub(user.sub) ? NONE : googleTeamPermissions(user.sub)
    default:
      return NONE
  }
}
