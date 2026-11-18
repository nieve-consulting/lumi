// The widget is built apart from the frontend, so it doesn't keep the list of languages the chat can be shown in (see
// @lumi/shared-contracts/language). It passes the host page's language on and follows the one the chat reports; only its
// own few strings on the host page are here, in the installation's default language, then English, for a language it has
// none for

// A base language code such as es
export type Language = string

// The base language of a BCP 47 tag, so es-MX is es. POSIX-style tags such as es_ES (e.g. WordPress's locale) are read as
// their BCP 47 form. Undefined for a missing or malformed tag
export function baseLanguage(tag: unknown): Language | undefined {
  if (typeof tag !== "string" || !tag) return undefined
  try {
    const [canonical] = Intl.getCanonicalLocales(tag.trim().replace(/_/g, "-"))
    return canonical?.split("-")[0].toLowerCase() || undefined
  } catch {
    return undefined
  }
}

interface Strings {
  // The bubble launcher's accessible name, open or closed
  openChat: string
  // The CTA launcher's accessible name while the chat is open, and its visible label
  closeChat: string
  close: string
  // The chat iframe's title
  chatTitle: string
  // Announced while the chat page loads
  loadingChat: string
}

const STRINGS: Record<string, (name: string) => Strings> = {
  en: (name) => ({
    openChat: `Chat with ${name}`,
    closeChat: `Close ${name} chat`,
    close: "Close",
    chatTitle: `${name}, AI assistant`,
    loadingChat: "Loading chat…",
  }),
  es: (name) => ({
    openChat: `Chatea con ${name}`,
    closeChat: `Cerrar el chat de ${name}`,
    close: "Cerrar",
    chatTitle: `${name}, asistente de IA`,
    loadingChat: "Cargando el chat…",
  }),
}

const hasStrings = (language: Language | undefined): language is Language => !!language && Object.prototype.hasOwnProperty.call(STRINGS, language)

// The language of the launcher's labels: the requested one, which is the language option or the one the chat reports, if
// the widget has strings for it; else, as the chat falls back, the installation's default language; else English
export function labelLanguage(language: Language | undefined, defaultLanguage: Language): Language {
  return hasStrings(language) ? language : hasStrings(defaultLanguage) ? defaultLanguage : "en"
}

// The widget's strings in the language, or in English when it has none for it, with the language they are in for the lang
// attribute, naming the assistant
export function launcherStrings(language: Language | undefined, assistantName: string): Strings & { lang: Language } {
  const lang = hasStrings(language) ? language : "en"
  return { ...STRINGS[lang](assistantName), lang }
}
