import { Metadata } from "next"
import Link from "next/link"

import { requirePasswordChangeAccess } from "@/lib/auth/admin"
import { ADMIN_HOME } from "@/lib/auth/paths"

import AuthCard from "../components/AuthCard"
import SignOutButton from "../components/SignOutButton"
import ChangePasswordForm from "./ChangePasswordForm"

export const dynamic = "force-dynamic"

export const metadata: Metadata = { title: "Change password | Admin" }

// Local mode only: the signed-in admin's new password. An admin with a temporary password is sent here before anything else
export default async function ChangePasswordPage() {
  const { user, required } = await requirePasswordChangeAccess()

  return (
    <AuthCard title={required ? "Choose a new password" : "Change password"}>
      <p className="mb-6 text-slate-500">
        {required
          ? "You signed in with a temporary password. Choose your own to continue to the admin."
          : "Choose a new password for signing in to the Lumi admin."}
      </p>
      <p className="mb-6 text-sm text-slate-500">
        Signed in as <span className="font-medium text-slate-700">{user.email}</span>
      </p>
      <ChangePasswordForm email={user.email} temporary={required} />
      <div className="mt-4 flex flex-col gap-2">
        {required ? (
          <SignOutButton className="w-full" variant="ghost" />
        ) : (
          <Link href={ADMIN_HOME} className="text-sm font-medium text-slate-600 underline-offset-4 hover:underline">
            Back to the admin
          </Link>
        )}
      </div>
    </AuthCard>
  )
}
