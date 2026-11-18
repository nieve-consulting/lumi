import { Metadata } from "next"
import { headers } from "next/headers"
import { redirect } from "next/navigation"

import { getAdminAccess } from "@/lib/auth/admin"
import { authConfig, isAuthConfigured } from "@/lib/auth/config"
import { safeCallbackUrl } from "@/lib/auth/paths"

import AuthCard from "../components/AuthCard"
import LocalSignInForm from "../components/LocalSignInForm"
import SignInButton from "../components/SignInButton"

export const dynamic = "force-dynamic"

export const metadata: Metadata = { title: "Sign in | Admin" }

interface SignInPageProps {
  // setup=done: the onboarding wizard just finished (local mode)
  searchParams: Promise<{ callbackUrl?: string | string[]; error?: string | string[]; setup?: string | string[] }>
}

// Origin of this request, like NextAuth's: NextAuth sends absolute callback URLs of it to this page
async function requestOrigin() {
  const requestHeaders = await headers()
  const host = requestHeaders.get("x-forwarded-host") || requestHeaders.get("host")
  const protocol = requestHeaders.get("x-forwarded-proto")?.split(",")[0].trim() || "http"
  return host ? `${protocol}://${host}` : undefined
}

export default async function SignInPage({ searchParams }: SignInPageProps) {
  const { callbackUrl, error, setup } = await searchParams
  const target = safeCallbackUrl(typeof callbackUrl === "string" ? callbackUrl : undefined, await requestOrigin())

  if (!isAuthConfigured()) {
    return (
      <AuthCard title="Sign-in unavailable">
        <p className="text-slate-500">Admin sign-in is not configured on this server. Contact the Lumi administrators.</p>
      </AuthCard>
    )
  }

  // Only admins go back to the admin; other signed-in accounts can choose another one here. A temporary password goes to the
  // admin too, which asks for a new one
  const { status } = await getAdminAccess()
  if (status === "granted" || status === "passwordChangeRequired") {
    redirect(target)
  }

  if (authConfig.mode === "local") {
    return (
      <AuthCard title="Lumi Admin">
        {setup === "done" ? (
          <p role="status" className="mb-6 rounded-md border border-green-200 bg-green-50 p-3 text-left text-sm text-green-900">
            Lumi is set up. Sign in with your admin account.
          </p>
        ) : (
          <p className="mb-6 text-slate-500">Sign in with your Lumi admin email and password.</p>
        )}
        <LocalSignInForm callbackUrl={target} initialError={typeof error === "string" ? error : undefined} />
        <p className="mt-6 text-sm text-slate-500">
          Forgot your password? Ask another Lumi admin to add you again, or the person who runs Lumi to reset it.
        </p>
      </AuthCard>
    )
  }

  return (
    <AuthCard title="Lumi Admin">
      <p className="mb-6 text-slate-500">Sign in with your company Google Workspace account.</p>
      {error && <p className="mb-4 text-sm text-red-600">Sign-in failed. Try again.</p>}
      <SignInButton callbackUrl={target} />
    </AuthCard>
  )
}
