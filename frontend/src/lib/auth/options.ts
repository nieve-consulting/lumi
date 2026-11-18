import "server-only"

import type { NextAuthOptions } from "next-auth"
import CredentialsProvider from "next-auth/providers/credentials"
import GoogleProvider, { type GoogleProfile } from "next-auth/providers/google"

import { authConfig, isAllowedDomain, isAuthConfigured } from "./config"
import { isAdminGroupMember } from "./directory"
import { SignInThrottledError, verifyAdminCredentials } from "./localAccounts"
import { AUTH_ERROR_PATH, authErrorPath, SIGN_IN_PATH, type AuthErrorCode } from "./paths"

// The client's IP for the sign-in throttle: the first x-forwarded-for entry (the visitor's, as the proxy in front saw it),
// else x-real-ip. Undefined when neither is there
function clientIp(headers: Record<string, unknown> | undefined) {
  const header = (name: string) => (typeof headers?.[name] === "string" ? (headers[name] as string) : undefined)
  return header("x-forwarded-for")?.split(",")[0]?.trim() || header("x-real-ip")?.trim() || undefined
}

// A thrown error's message becomes the error NextAuth reports, so these are auth error codes
const failWith = (code: AuthErrorCode) => new Error(code)

// Google Workspace accounts in the admin group (workspace mode)
function googleProvider() {
  return GoogleProvider({
    clientId: authConfig.google.clientId,
    clientSecret: authConfig.google.clientSecret,
    authorization: {
      params: {
        scope: "openid email profile",
        prompt: "select_account",
        // Only a hint for Google's account chooser; the validated `hd` claim is checked in the signIn callback
        ...(authConfig.allowedDomains.length === 1 && { hd: authConfig.allowedDomains[0] }),
      },
    },
  })
}

// Email and password accounts kept by the API (local mode). A wrong email or password gives NextAuth's CredentialsSignin, the
// same for both; the API throttles failures per email and per client IP
function localProvider() {
  return CredentialsProvider({
    id: "local",
    name: "Email and password",
    credentials: {
      email: { label: "Email", type: "email" },
      password: { label: "Password", type: "password" },
    },
    async authorize(credentials, request) {
      if (!isAuthConfigured()) throw failWith("Configuration")
      const email = typeof credentials?.email === "string" ? credentials.email : ""
      const password = typeof credentials?.password === "string" ? credentials.password : ""
      if (!email.trim() || !password) return null

      try {
        const account = await verifyAdminCredentials(email, password, clientIp(request?.headers))
        return account && { id: account.id, email: account.email, name: account.name ?? null, passwordChangedAt: account.passwordChangedAt }
      } catch (error) {
        if (error instanceof SignInThrottledError) throw failWith("RateLimited")
        // Never the error object: the request it may hold has the password in its variables
        console.error(`[Auth]: Checking an admin's email and password failed: ${(error as Error).message}`)
        throw failWith("CredentialsCheckFailed")
      }
    },
  })
}

export const authOptions: NextAuthOptions = {
  secret: authConfig.secret,
  // Encrypted cookie session. Admin access is checked again on every privileged request: against the Google Group in workspace
  // mode, against the account in local mode. NextAuth extends the cookie when the session is read, so getAdminAccess also
  // enforces maxAge from the sign-in time
  session: { strategy: "jwt", maxAge: authConfig.sessionMaxAgeSeconds },
  // Only the configured mode's provider; none when ADMIN_AUTH_PROVIDER is unset or invalid
  providers: authConfig.mode === "workspace" ? [googleProvider()] : authConfig.mode === "local" ? [localProvider()] : [],
  pages: { signIn: SIGN_IN_PATH, error: AUTH_ERROR_PATH },
  callbacks: {
    async signIn({ account, profile, user }) {
      if (!isAuthConfigured()) {
        return authErrorPath("Configuration")
      }

      if (authConfig.mode === "local") {
        // authorize already checked the email and password
        return account?.provider === "local" && Boolean(user?.id) ? true : authErrorPath("AccessDenied")
      }

      // The profile holds the claims of the ID token validated by the provider (signature, issuer, audience and expiry)
      const googleProfile = profile as GoogleProfile | undefined
      if (account?.provider !== "google" || !googleProfile?.sub || !googleProfile.email) {
        return authErrorPath("AccessDenied")
      }
      if (googleProfile.email_verified !== true) {
        return authErrorPath("EmailNotVerified")
      }
      if (!isAllowedDomain(googleProfile.hd)) {
        return authErrorPath("DomainNotAllowed")
      }

      try {
        return (await isAdminGroupMember(googleProfile.sub)) ? true : authErrorPath("NotMember")
      } catch {
        return authErrorPath("MembershipCheckFailed")
      }
    },
    async jwt({ token, account, profile, user }) {
      // Only set on sign-in; never keep the provider's tokens
      if (account?.provider === "google" && profile) {
        // The identity from the validated Google profile
        const googleProfile = profile as GoogleProfile
        token.provider = "google"
        token.sub = googleProfile.sub
        token.email = googleProfile.email
        token.hd = googleProfile.hd
        token.signedInAt = Math.floor(Date.now() / 1000)
      } else if (account?.provider === "local" && user) {
        // The account id, its email, name and password stamp, as authorize found them
        token.provider = "local"
        token.sub = user.id
        token.email = user.email
        token.name = user.name
        token.passwordChangedAt = user.passwordChangedAt
        delete token.hd
        delete token.picture
        token.signedInAt = Math.floor(Date.now() / 1000)
      }
      return token
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.sub
        session.user.hd = token.hd
      }
      session.provider = token.provider
      session.signedInAt = token.signedInAt
      if (token.passwordChangedAt) session.passwordChangedAt = token.passwordChangedAt
      return session
    },
  },
}
