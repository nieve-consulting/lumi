import type { DefaultSession } from "next-auth"

import type { SessionProvider } from "@/lib/auth/mode"

declare module "next-auth" {
  interface Session {
    user?: DefaultSession["user"] & {
      // The Google account's `sub`, or the local admin account's id
      id?: string
      // Workspace domain of the Google account
      hd?: string
    }
    // How the session signed in; unset in sessions from before sign-in modes, which all came from Google
    provider?: SessionProvider
    // Sign-in time in seconds since the epoch
    signedInAt?: number
    // Local mode: when the account's password was last set as of the sign-in; a later change ends the session
    passwordChangedAt?: string
  }

  // What the local provider's authorize returns
  interface User {
    passwordChangedAt?: string
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    // Unset in sessions from before sign-in modes, which all came from Google
    provider?: SessionProvider
    hd?: string
    signedInAt?: number
    passwordChangedAt?: string
  }
}
