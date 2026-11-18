import type { NextRequest } from "next/server"
import { LANGUAGE_COOKIE, LANGUAGE_PARAM, matchAcceptLanguage, matchLanguage, type Language } from "@lumi/shared-contracts/language"

// The chat pages, the language route each is rewritten to and whether they follow the browser's preferred languages. The
// widget only follows the host page's language option, passed as the query parameter, so it stays in the business's
// default language on pages that don't set one
export type LanguagePage = { route: (language: Language) => string; acceptLanguage: boolean }

export const CHAT_PAGES: Record<string, LanguagePage> = {
  "/": { route: (language) => `/chat/${language}`, acceptLanguage: true },
  "/widget": { route: (language) => `/widget/${language}`, acceptLanguage: false },
}

// The visitor's remembered choice wins, then the query parameter, then the browser's preferences where the page follows
// them, then the business's default language
export function resolvePageLanguage(request: NextRequest, { acceptLanguage }: { acceptLanguage: boolean }, defaultLanguage: Language): Language {
  return (
    matchLanguage(request.cookies.get(LANGUAGE_COOKIE)?.value) ??
    matchLanguage(request.nextUrl.searchParams.get(LANGUAGE_PARAM)) ??
    (acceptLanguage ? matchAcceptLanguage(request.headers.get("accept-language")) : undefined) ??
    defaultLanguage
  )
}
