"use client"

import { createContext, useCallback, useContext, useEffect, useMemo, useState, useSyncExternalStore } from "react"
import { DEFAULT_LANGUAGE, formattingLocale, LANGUAGE_COOKIE, type Language } from "@lumi/shared-contracts/language"

import { useBusiness } from "@/lib/BusinessProvider"
import { UNSET_BUSINESS } from "@/lib/businessSettings"

import { getMessages, type Messages } from "."

interface LanguageContextValue {
  language: Language
  t: Messages
  setLanguage: (language: Language) => void
  // Whether a provider chose the language, as the chat does; false where it's only the default, e.g. in the admin interface
  provided: boolean
}

// Without a provider, e.g. in the admin interface, components that also show in the chat stay in English
const LanguageContext = createContext<LanguageContextValue>({
  language: DEFAULT_LANGUAGE,
  t: getMessages(DEFAULT_LANGUAGE, UNSET_BUSINESS),
  setLanguage: () => {},
  provided: false,
})

const ONE_YEAR = 60 * 60 * 24 * 365

// Remembers the choice for the server to render later visits in it. In the widget the chat is a third-party iframe, so the
// cookie is partitioned by the host site; browsers that block it there keep the choice only until the chat reloads
function rememberLanguage(language: Language) {
  const framed = window.parent !== window
  const attributes = framed ? "SameSite=None; Secure; Partitioned" : `SameSite=Lax${location.protocol === "https:" ? "; Secure" : ""}`
  try {
    document.cookie = `${LANGUAGE_COOKIE}=${language}; Path=/; Max-Age=${ONE_YEAR}; ${attributes}`
  } catch (error) {
    // E.g. a sandboxed iframe without access to cookies
    console.warn("Couldn't remember the chat language", error)
  }
}

interface IProps {
  // Resolved on the server, so the first render is already in the chat's language
  initialLanguage: Language
  children: React.ReactNode
}

// Inside a BusinessProvider, whose assistant and business the text names
export function LanguageProvider({ initialLanguage, children }: IProps) {
  const { assistantName, businessName } = useBusiness()
  const [language, setLanguageState] = useState(initialLanguage)

  // Switching changes the interface in place, keeping the conversation and the draft
  const setLanguage = useCallback((language: Language) => {
    setLanguageState(language)
    rememberLanguage(language)
  }, [])

  // The root layout is static and in the default language, so the page's own language is set once it loads and on a switch
  useEffect(() => {
    document.documentElement.lang = language
  }, [language])

  const value = useMemo(
    () => ({ language, t: getMessages(language, { assistantName, businessName }), setLanguage, provided: true }),
    [language, assistantName, businessName, setLanguage]
  )

  // The wrapper marks the content with its language before the page loads too, without taking part in the layout
  return (
    <LanguageContext value={value}>
      <div lang={language} className="contents">
        {children}
      </div>
    </LanguageContext>
  )
}

export function useI18n() {
  return useContext(LanguageContext)
}

function subscribeToLanguages(onChange: () => void) {
  window.addEventListener("languagechange", onChange)
  return () => window.removeEventListener("languagechange", onChange)
}

// Locale for dates and times in the chat's language, keeping the visitor's regional variant of it. The server doesn't know
// the browser's locales (its own navigator, on recent Node, has the server's), so server rendering and hydration use the
// language alone and the browser then switches to the visitor's variant
export function useFormattingLocale() {
  const { language } = useI18n()
  return useSyncExternalStore(
    subscribeToLanguages,
    () => formattingLocale(language, navigator.languages),
    () => language
  )
}
