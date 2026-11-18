import { DEFAULT_LANGUAGE, type Language } from "@lumi/shared-contracts/language"

import { en, type MessageBrand, type Messages } from "./messages/en"
import { es } from "./messages/es"

export type { MessageBrand, Messages }

// Fills anything a translation lacks at runtime from English rather than breaking the chat. An empty string is kept: the
// parts around a link, e.g. the disclaimer's, can be empty in a language whose sentence starts or ends with the link
function withFallback<T>(translation: T, fallback: T): T {
  if (typeof fallback !== "object" || fallback === null) return translation ?? fallback
  const merged = { ...fallback } as Record<string, unknown>
  for (const key of Object.keys(fallback)) {
    merged[key] = withFallback((translation as Record<string, unknown> | undefined)?.[key], (fallback as Record<string, unknown>)[key])
  }
  return merged as T
}

// Each language's interface text, naming the installation's assistant and business. A new language adds its messages here
// and to LANGUAGES in the shared contracts; the typecheck then asks for its greeting, its agents API text and its calendar
// locale. The widget's launcher shows it in English until widget/src/i18n.ts gets its few strings
const MESSAGES: Record<Language, (brand: MessageBrand) => Messages> = {
  en,
  es: (brand) => withFallback(es(brand), en(brand)),
}

export function getMessages(language: Language, brand: MessageBrand): Messages {
  return (MESSAGES[language] ?? MESSAGES[DEFAULT_LANGUAGE])(brand)
}
