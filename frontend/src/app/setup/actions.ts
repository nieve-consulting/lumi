"use server"

import { redirect } from "next/navigation"
import type { FirstAdminInput } from "@/generated/graphql"
import type { BusinessSettingsInput } from "@lumi/shared-contracts/business"

import { getClient } from "@/lib/apiClient"
import { hasAdminAccounts } from "@/lib/auth/localAccounts"
import { authMode } from "@/lib/auth/mode"
import { ADMIN_HOME, signInPath } from "@/lib/auth/paths"
import { fetchPublicBusiness } from "@/lib/business"
import { expireBusiness, saveBusiness, type SaveBusinessResult } from "@/lib/businessSave"
import { hasSetupAccess, unlockSetup as unlock, type UnlockResult } from "@/lib/setupToken"

// locked: the installation asks for a setup token and the visitor's access expired or no longer matches it
export type SetupResult = SaveBusinessResult | { ok: false; locked: true }

// Expires the cached settings when the API has none, e.g. after the record was deleted outside the app, so the chat pages
// built from them don't outlive the new setup. A page can't expire the cache while rendering, so the wizard calls this
export async function expireStaleBusiness() {
  if ((await fetchPublicBusiness().catch(() => undefined)) === null) expireBusiness()
}

// Opens the wizard to a visitor who has the installation's setup token (see lib/setupToken.ts)
export async function unlockSetup(token: string): Promise<UnlockResult> {
  return unlock(typeof token === "string" ? token : "")
}

// Sets the business up from the onboarding wizard, then opens the chat, or the admin's sign-in in local sign-in mode. Open to
// anyone, or to whoever gave the setup token when the installation sets one (always in local sign-in mode): the API only
// accepts it while the installation has no settings, and answers ALREADY_SET_UP afterwards. firstAdmin: local sign-in mode's
// first admin, created with the settings, which the API refuses with ADMIN_EXISTS once an admin exists; ignored in the other
// modes. Returns only when the settings weren't saved
export async function setupBusiness(settings: BusinessSettingsInput, firstAdmin?: FirstAdminInput): Promise<SetupResult> {
  if (!(await hasSetupAccess())) return { ok: false, locked: true }
  const local = authMode() === "local"
  const admin = local && firstAdmin ? { email: firstAdmin.email, name: firstAdmin.name || null, password: firstAdmin.password } : undefined
  // Without one, nobody could sign in to the admin of a new local installation
  if (local && !admin) {
    const exists = await hasAdminAccounts().catch(() => undefined)
    if (exists === undefined) return { ok: false, error: "The settings couldn't be saved: the server didn't answer. Try again in a moment." }
    if (!exists) return { ok: false, problems: [{ field: "firstAdmin.email", message: "Enter the administrator's email address" }] }
  }
  const result = await saveBusiness(getClient(), "setupBusiness", settings, admin)
  if (result.ok) redirect(local ? `${signInPath(ADMIN_HOME)}&setup=done` : "/")
  return result
}
