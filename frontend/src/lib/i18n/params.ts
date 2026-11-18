import { notFound } from "next/navigation"
import { LANGUAGES, type Language } from "@lumi/shared-contracts/language"

// The chat pages' language segment, which the proxy rewrites their requests to (see resolve.ts). No language is rendered at
// build time, when the API with the business settings may be out of reach: each is rendered on its first request, then
// served prerendered until saving the settings expires it (see lib/business.ts). Other segments are answered with a 404
export const generateLanguageParams = (): { lang: Language }[] => []

export async function languageFromParams(params: Promise<{ lang: string }>): Promise<Language> {
  const { lang } = await params
  return LANGUAGES.find((language) => language === lang) ?? notFound()
}
