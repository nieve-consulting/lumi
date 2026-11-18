import { z } from "zod"

// Languages the public chat and the widget can be shown in. Lumi's generated replies follow the visitor's own language
// whatever this is; it covers the interface and the fixed text the agents API writes into conversations
export const LANGUAGES = ["en", "es"] as const

export type Language = (typeof LANGUAGES)[number]

export const DEFAULT_LANGUAGE: Language = "en"

// Languages a record's content can be translated into: every language but English, the content's own language
export const TRANSLATION_LANGUAGES = LANGUAGES.filter((language) => language !== DEFAULT_LANGUAGE) as [Language, ...Language[]]

// Each language by its own name, as the language switcher lists them
export const LANGUAGE_NAMES: Record<Language, string> = {
  en: "English",
  es: "Español",
}

// Query parameter of the public chat and /widget pages, also set by the widget's language option
export const LANGUAGE_PARAM = "language"

// Remembers the language the visitor picked in the chat menu, which wins over the query parameter and the browser's
export const LANGUAGE_COOKIE = "lumi-language"

const isLanguage = (value: string): value is Language => (LANGUAGES as readonly string[]).includes(value)

// Matches a BCP 47 tag by its base language, so es-MX is es. POSIX-style tags such as es_ES (e.g. WordPress's locale) are
// read as their BCP 47 form. Undefined for a missing, malformed or unsupported tag
export function matchLanguage(tag: string | null | undefined): Language | undefined {
  if (!tag) return undefined
  try {
    const [canonical] = Intl.getCanonicalLocales(tag.trim().replace(/_/g, "-"))
    const base = canonical?.split("-")[0].toLowerCase()
    return base && isLanguage(base) ? base : undefined
  } catch {
    return undefined
  }
}

// The first supported language among an Accept-Language header's, in the visitor's order of preference
export function matchAcceptLanguage(header: string | null | undefined): Language | undefined {
  if (!header) return undefined
  const preferences = header
    .split(",")
    .map((entry, index) => {
      const [tag, ...params] = entry.trim().split(";")
      const q = params.map((param) => param.trim()).find((param) => param.startsWith("q="))
      const quality = q ? Number(q.slice(2)) : 1
      return { tag, quality: Number.isFinite(quality) ? quality : 0, index }
    })
    .filter(({ tag, quality }) => tag && tag !== "*" && quality > 0)
    .sort((a, b) => b.quality - a.quality || a.index - b.index)

  for (const { tag } of preferences) {
    const language = matchLanguage(tag)
    if (language) return language
  }
  return undefined
}

// Formats dates in the chat's language, keeping the visitor's regional variant when their own locale is in that language,
// e.g. es-MX rather than es for a Mexican visitor of a Spanish chat
export function formattingLocale(language: Language, preferredLocales: readonly string[] = []) {
  return preferredLocales.find((locale) => matchLanguage(locale) === language) ?? language
}

// A language sent to the agents API. A missing or unsupported one is dropped rather than failing the request, so the API
// falls back to the default language
export const languageSchema = z.string().max(64).transform(matchLanguage).optional().catch(undefined)
