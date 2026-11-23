import type { PageAlternate } from "@/utils/htmlPage"

import { siteHost } from "./websiteUrls"

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

// A path's leading language segment, as in /es/blog, /en-gb/about or /es-419/about
const LANGUAGE_SEGMENT = /^\/([a-z]{2}(?:[-_](?:[a-z]{2,4}|\d{3}))?)(?=\/|$)/i

// Query parameters that can name a page's language, as in /about?lang=es
const LANGUAGE_PARAMS = new Set(["lang", "language", "locale", "hl"])

// A path and query without trailing slashes, as a website links the same page with or without one
const withoutTrailingSlash = (path: string) => path.replace(/(?<=.)\/+(?=\?|$)/, "")

// The path without what names its language as the page's own: a leading segment or a query parameter in that language, so
// /es/blog, /blog?lang=es and /blog are translations of each other. A path whose segment or parameter names another language,
// such as /it/support on a page in English, is kept as it is
function withoutLanguage(path: string, language: string | undefined) {
  if (!language) return path
  const segment = LANGUAGE_SEGMENT.exec(path)
  const rest = segment && baseLanguage(segment[1]) === language ? path.slice(segment[0].length) || "/" : path

  const queryStart = rest.indexOf("?")
  if (queryStart < 0) return rest
  const params = new URLSearchParams(rest.slice(queryStart + 1))
  const languageParams = [...params.keys()].filter((name) => LANGUAGE_PARAMS.has(name.toLowerCase()) && baseLanguage(params.get(name)) === language)
  if (!languageParams.length) return rest
  for (const name of languageParams) params.delete(name)
  return (rest.slice(0, queryStart) || "/") + (params.size ? `?${params}` : "")
}

// A page's address in translation keys: its site's host (with or without www), path and query, without trailing slashes. With
// the host, translations on another of the business's websites (es.example.com) share a key too
const pageAddress = (url: URL, path = url.pathname + url.search) => `${siteHost(url.hostname)}${withoutTrailingSlash(path)}`

// The page's language and the key its translations share. The page names both in its hreflang links when they list the page
// itself, as Google asks: the language is its own link's, else its <html> element's, and the key is the first of its links'
// addresses in alphabetical order. Without x-default, which some websites point at their home page from every page. Links that
// don't list the page are taken to be shared by every page (such as a language switcher's) rather than its translations; then
// the key is its address without its language's path segment or query parameter. A path segment alone doesn't set the
// language, as /it or /uk can name a department or an office
export function readPageLanguage(page: { listedUrl: URL; url: URL; lang: string | undefined; alternates: PageAlternate[] }) {
  const ownAddresses = new Set([pageAddress(page.listedUrl), pageAddress(page.url)])
  const links = page.alternates.flatMap(({ hreflang, href }) => {
    const url = URL.parse(href, page.url)
    return url && (url.protocol === "https:" || url.protocol === "http:") ? [{ hreflang: hreflang.toLowerCase(), address: pageAddress(url) }] : []
  })
  const listsItself = links.some(({ address }) => ownAddresses.has(address))
  const translations = links.filter(({ hreflang }) => hreflang !== "x-default")

  const ownLink = translations.find(({ address }) => ownAddresses.has(address))
  const language = baseLanguage(ownLink?.hreflang) ?? baseLanguage(page.lang)

  const listedPath = page.listedUrl.pathname + page.listedUrl.search
  const translationKey =
    (listsItself ? translations.map(({ address }) => address).sort()[0] : undefined) ??
    pageAddress(page.listedUrl, withoutLanguage(listedPath, language))

  return { language: language ?? null, translationKey }
}
