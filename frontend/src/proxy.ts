import { NextResponse } from "next/server"
import type { NextRequest } from "next/server"
import { DEFAULT_LANGUAGE, type Language } from "@lumi/shared-contracts/language"
import { getToken } from "next-auth/jwt"

import { authMode, matchesMode } from "@/lib/auth/mode"
import { signInPath } from "@/lib/auth/paths"
import { isSessionExpired } from "@/lib/auth/session"
import { businessState } from "@/lib/businessState"
import { CHAT_PAGES, resolvePageLanguage, type LanguagePage } from "@/lib/i18n/resolve"

// Chat pages: rewrites them to their language's route, prerendered so the first render is already in it. The URL and its
// query stay as they are. Covers every method, e.g. the server actions the chat calls on its page. Next.js serves the
// prerendered page without Vary, which is fine on Vercel, whose cache is keyed by the rewritten route; a CDN in front of the
// app would need to forward the cookie and Accept-Language to it rather than cache by URL
function withLanguage(request: NextRequest, page: LanguagePage, defaultLanguage: Language) {
  const url = request.nextUrl.clone()
  url.pathname = page.route(resolvePageLanguage(request, page, defaultLanguage))
  return NextResponse.rewrite(url)
}

// The widget's page lives in other sites' iframes, so it says the assistant isn't available instead of showing the wizard
const isWidget = (pathname: string) => pathname === "/widget" || pathname.startsWith("/widget/")

// Until the business is set up, every page goes to the onboarding wizard, by any method. Then the chat pages get their language,
// and admin pages an early navigation check: admin page requests without a valid session of the configured sign-in mode go to
// the sign-in page. Group membership (workspace mode) or the account (local mode) is checked by requireAdminAccess in the admin pages, server actions and route handlers, which also answer
// other requests. When the API can't say whether the business is set up, requests go through for the pages to report it
export async function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl
  const state = await businessState()
  if (state?.setUp === false && !isWidget(pathname)) {
    return NextResponse.redirect(new URL("/setup", request.url), 307)
  }

  const chatPage = CHAT_PAGES[pathname]
  if (chatPage) return withLanguage(request, chatPage, state?.setUp ? state.defaultLanguage : DEFAULT_LANGUAGE)

  if (!pathname.startsWith("/admin") || (request.method !== "GET" && request.method !== "HEAD")) {
    return NextResponse.next()
  }

  const secret = process.env.NEXTAUTH_SECRET
  const mode = authMode()
  // Missing, expired or tampered session cookies give no token; a session from the other sign-in mode counts as none
  const token = secret && mode ? await getToken({ req: request, secret }) : null
  if (token && !isSessionExpired(token.signedInAt) && matchesMode(token.provider, mode)) {
    return NextResponse.next()
  }

  return NextResponse.redirect(new URL(signInPath(`${pathname}${search}`), request.url))
}

export const config = {
  // Every page but the onboarding wizard's: not route handlers (/api, /media), Next.js's own files or static files, i.e.
  // public/ and any path with a file extension
  matcher: ["/((?!setup(?:/|$)|api/|media/|_next/|scripts/|images/|fonts/|favicon\\.ico$|robots\\.txt$)(?!.*\\.[^/]+$).*)"],
}
