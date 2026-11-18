// What the email and password sign-in form says for the errors NextAuth reports (see lib/auth/options.ts). Generic on
// purpose: none tells whether the email has an account
const LOCAL_SIGN_IN_ERRORS: Record<string, string> = {
  CredentialsSignin: "Email or password is incorrect.",
  RateLimited: "Too many failed sign-in attempts. Wait 15 minutes, then try again.",
  CredentialsCheckFailed: "Your email and password couldn't be checked right now. Try again in a moment.",
  Configuration: "Admin sign-in isn't configured correctly on this server. Contact the person who runs Lumi.",
}

export function localSignInErrorMessage(error: string | null | undefined) {
  if (!error) return undefined
  return LOCAL_SIGN_IN_ERRORS[error] ?? "Sign-in failed. Try again."
}
