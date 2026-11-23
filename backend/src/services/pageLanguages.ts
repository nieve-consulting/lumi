import type { PageAlternate } from "@/utils/htmlPage"

import { sameSite } from "./websiteUrls"

// The languages of a website's pages, which the crawler records (src/tasks/websiteCrawler) so website search prefers pages in
// the conversation's language and leaves out a page's translation into another one

const languageNames = new Intl.DisplayNames(["en"], { type: "language", fallback: "none" })

// A language tag's ISO 639-1 code, so en-GB and en_US are en. Undefined for a missing or malformed tag, one without a two-letter
// code, or one that names no language (und)
export function baseLanguage(tag: string | null | undefined): string | undefined {
  if (!tag) return undefined
  try {
    const [canonical] = Intl.getCanonicalLocales(tag.trim().replace(/_/g, "-"))
    const base = canonical?.split("-")[0].toLowerCase()
    return base && base.length === 2 && languageNames.of(base) ? base : undefined
  } catch {
    return undefined
  }
}

// Whether a page suits a conversation in the language (an ISO 639-1 code): one in that language, or one whose language isn't
// known. Without the conversation's language, any page does
export const inLanguage = (page: { language: string | null }, language: string | undefined) =>
  !language || !page.language || page.language === language

// A path's leading language segment, as in /es/blog or /en-gb/about
const LANGUAGE_SEGMENT = /^\/([a-z]{2}(?:[-_][a-z]{2,4})?)(?=\/|$)/i

// The path without its leading segment when that segment is the language, so /es/blog and /blog are translations of each other
function withoutLanguageSegment(path: string, language: string | undefined) {
  const segment = LANGUAGE_SEGMENT.exec(path)
  if (!segment || !language || baseLanguage(segment[1]) !== language) return path
  return path.slice(segment[0].length) || "/"
}

// A path and query without trailing slashes, as a website links the same page with or without one
const withoutTrailingSlash = (path: string) => path.replace(/\/+(?=\?|$)/, "") || "/"

// The path and query of a URL on the page's site, which hreflang links give as absolute URLs, often with or without www
function sitePath(href: string, pageUrl: URL) {
  const url = URL.parse(href, pageUrl)
  if (!url || !sameSite(url.hostname, pageUrl.hostname)) return undefined
  return withoutTrailingSlash(url.pathname + url.search)
}

// The page's language and the key its translations share. The language is the one its <html> element declares, else the one its
// own hreflang link gives it, else its path's leading language segment. Translations share the path of the x-default page their
// hreflang links name, else the first of their paths in alphabetical order; a page without them shares its path without its
// language segment
export function readPageLanguage(page: { path: string; url: string; lang: string | undefined; alternates: PageAlternate[] }) {
  const pageUrl = URL.parse(page.url)
  const alternates = pageUrl
    ? page.alternates.flatMap(({ hreflang, href }) => {
        const path = sitePath(href, pageUrl)
        return path ? [{ hreflang: hreflang.toLowerCase(), path }] : []
      })
    : []
  const ownPaths = [page.path, ...(pageUrl ? [pageUrl.pathname + pageUrl.search] : [])].map(withoutTrailingSlash)

  const language =
    baseLanguage(page.lang) ??
    baseLanguage(alternates.find(({ path, hreflang }) => hreflang !== "x-default" && ownPaths.includes(path))?.hreflang) ??
    baseLanguage(LANGUAGE_SEGMENT.exec(page.path)?.[1])

  const translations = alternates.filter(({ hreflang }) => hreflang !== "x-default").map(({ path }) => path)
  const translationKey =
    alternates.find(({ hreflang }) => hreflang === "x-default")?.path ?? translations.sort()[0] ?? withoutLanguageSegment(page.path, language)

  return { language: language ?? null, translationKey: withoutTrailingSlash(translationKey) }
}
