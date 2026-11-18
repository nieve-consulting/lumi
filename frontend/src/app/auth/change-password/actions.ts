"use server"

import { redirect } from "next/navigation"
import { adminPasswordSchema } from "@lumi/shared-contracts/adminAccounts"

import { requirePasswordChangeAccess } from "@/lib/auth/admin"
import { changeAdminPassword } from "@/lib/auth/localAccounts"
import { authErrorPath } from "@/lib/auth/paths"

export type ChangePasswordFormResult =
  { ok: true } | { ok: false; field: "currentPassword" | "newPassword"; message: string } | { ok: false; error: string }

// Changes the signed-in admin's password (local mode). Works with a temporary password, which is what it replaces. A change
// ends every session of the account, this one included, so the form signs in again with the new password
export async function changePassword(currentPassword: string, newPassword: string): Promise<ChangePasswordFormResult> {
  const { user } = await requirePasswordChangeAccess()
  if (typeof currentPassword !== "string" || !currentPassword) {
    return { ok: false, field: "currentPassword", message: "Enter your current password" }
  }
  const policy = adminPasswordSchema.safeParse(newPassword)
  if (!policy.success) return { ok: false, field: "newPassword", message: policy.error.issues[0]?.message ?? "Choose another password" }

  const result = await changeAdminPassword(user.id, currentPassword, newPassword)
  if (result.ok || "field" in result) return result
  switch (result.code) {
    case "RATE_LIMITED":
      return {
        ok: false,
        error: `Too many wrong passwords. Wait ${result.retryAfterMinutes ? `${result.retryAfterMinutes} minute${result.retryAfterMinutes === 1 ? "" : "s"}` : "15 minutes"}, then try again.`,
      }
    case "NOT_FOUND":
      redirect(authErrorPath("AccountRemoved"))
    default:
      return { ok: false, error: "Your password couldn't be changed: the server didn't answer. Try again in a moment." }
  }
}
