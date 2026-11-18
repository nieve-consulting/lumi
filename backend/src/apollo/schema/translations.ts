import type { RecordTranslation, TranslatedRecord } from "@/services/translations"

// A record's content in every language, with its times as ISO strings as GraphQL returns them
export function translationsForGraphQL<R extends TranslatedRecord>(translations: RecordTranslation<R>[]) {
  return translations.map((translation) => ({ ...translation, updated_at: translation.updated_at.toISOString() }))
}
