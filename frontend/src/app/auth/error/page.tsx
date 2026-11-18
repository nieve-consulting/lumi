import { Metadata } from "next"
import Link from "next/link"
import { getServerSession } from "next-auth"

import { authConfig, isAuthConfigured } from "@/lib/auth/config"
import { matchesMode } from "@/lib/auth/mode"
import { authOptions } from "@/lib/auth/options"
import { ADMIN_HOME, signInPath, type AuthErrorCode } from "@/lib/auth/paths"
import { isSessionExpired } from "@/lib/auth/session"
import { Button } from "@/components/ui/button"

import AuthCard from "../components/AuthCard"
import SignInButton from "../components/SignInButton"
import SignOutButton from "../components/SignOutButton"

export const dynamic = "force-dynamic"

export const metadata: Metadata = { title: "Access denied | Admin" }

const errors: Record<AuthErrorCode | "Default", { title: string; message: string }> = {
  Configuration: {
    title: "Sign-in unavailable",
    message: "Admin sign-in is not configured correctly on this server. Contact the Lumi administrators.",
  },
  AccessDenied: { title: "Access denied", message: "Your account does not have access to the Lumi admin." },
  EmailNotVerified: { title: "Access denied", message: "The email address of your Google account is not verified." },
  DomainNotAllowed: {
    title: "Access denied",
    message: "Sign in with your company Google Workspace account. Personal and other organizations' accounts cannot access the admin.",
  },
  NotMember: {
    title: "Access denied",
    message:
      "Your account is not in the Google Group that grants access to the Lumi admin. Ask a Workspace administrator to add you, then try again.",
  },
  MembershipCheckFailed: {
    title: "Access could not be verified",
    message: "Your admin access could not be verified with Google. Try again in a moment, and contact the Lumi administrators if it keeps failing.",
  },
  CredentialsSignin: { title: "Sign-in failed", message: "Email or password is incorrect. Try again." },
  RateLimited: {
    title: "Too many attempts",
    message: "Too many failed sign-in attempts for this account or network. Wait 15 minutes, then try again.",
  },
  CredentialsCheckFailed: {
    title: "Sign-in failed",
    message:
      "Your email and password couldn't be checked right now. Try again in a moment, and contact the person who runs Lumi if it keeps failing.",
  },
  AccountRemoved: {
    title: "Access removed",
    message: "Your admin account was removed. Ask another Lumi admin to add you again if you still need access.",
  },
  AccountCheckFailed: {
    title: "Access could not be verified",
    message: "Your admin access couldn't be verified right now. Try again in a moment, and contact the person who runs Lumi if it keeps failing.",
  },
  Default: { title: "Sign-in failed", message: "Something went wrong while signing in. Try again." },
}

// Errors that a moment later may not happen again: a signed-in admin just reloads the admin
const RETRYABLE: readonly string[] = ["MembershipCheckFailed", "AccountCheckFailed"]

interface ErrorPageProps {
  searchParams: Promise<{ error?: string | string[] }>
}

export default async function AuthErrorPage({ searchParams }: ErrorPageProps) {
  const { error } = await searchParams
  const code = typeof error === "string" && Object.hasOwn(errors, error) ? (error as AuthErrorCode) : "Default"
  const { title, message } = errors[code]

  const session = isAuthConfigured() ? await getServerSession(authOptions) : null
  const email = session && !isSessionExpired(session.signedInAt) && matchesMode(session.provider, authConfig.mode) ? session.user?.email : undefined

  return (
    <AuthCard title={title}>
      <p className="mb-6 text-slate-500">{message}</p>
      {email && (
        <p className="mb-6 text-sm text-slate-500">
          Signed in as <span className="font-medium text-slate-700">{email}</span>
        </p>
      )}
      {code !== "Configuration" && (
        <div className="flex flex-col gap-2">
          {RETRYABLE.includes(code) && email ? (
            <Button asChild>
              <Link href={ADMIN_HOME}>Try again</Link>
            </Button>
          ) : authConfig.mode === "local" ? (
            // Signing out first, when signed in, so the sign-in page doesn't send an admin back to the admin
            !email && (
              <Button asChild>
                <Link href={signInPath()}>Sign in again</Link>
              </Button>
            )
          ) : (
            <SignInButton callbackUrl={ADMIN_HOME} text={email ? "Use another account" : "Sign in again"} />
          )}
          {email && <SignOutButton className="w-full" />}
        </div>
      )}
    </AuthCard>
  )
}
