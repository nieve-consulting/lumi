import { DEFAULT_LANGUAGE, LANGUAGE_PARAM, LANGUAGES, matchLanguage, TRANSLATION_LANGUAGES, type Language } from "@lumi/shared-contracts/language"

import { assertSaved } from "@/lib/utils"

// Helpers for editing record content per language in the admin. They work on server and client components alike.
// A record's `translations` hold its content in each language it has, English first; a language with no entry is missing,
// and a null field of an entry is untranslated, so visitors read it in English

export { DEFAULT_LANGUAGE, LANGUAGE_PARAM, LANGUAGES, TRANSLATION_LANGUAGES, type Language }

// What the admin needs from a translation of any record type to tell its status
export interface TranslationStatusLike {
  language: string
  outdated: boolean
  // An AI translation saved for review (bulk translation): visitors read English until the team saves it
  draft?: boolean
  updated_at?: string
}

// "outdated_draft" is an AI draft made before English last changed: saving it marks it up to date against the current
// English, so it's both a draft and outdated, and lists and filters count it as each
export type TranslationStatus = "translated" | "missing" | "draft" | "outdated_draft" | "outdated"

// Whether the status is an AI draft awaiting review, made before English last changed or not
export const isDraftStatus = (status: TranslationStatus) => status === "draft" || status === "outdated_draft"

// The language a search parameter (e.g. the edit page's ?language=es) asks for, matched as the public chat matches it, so
// es-ES is es: English when missing or unsupported
export function parseLanguage(value: string | string[] | null | undefined): Language {
  return matchLanguage(Array.isArray(value) ? value[0] : value) ?? DEFAULT_LANGUAGE
}

// An edit page's search parameters, whose LANGUAGE_PARAM opens the form in that language
export type LanguageSearchParams = Promise<{ [LANGUAGE_PARAM]?: string | string[] }>

const englishNames = new Intl.DisplayNames(["en"], { type: "language" })

// A language's name in English, for the admin's own copy (toasts, column headers). The switcher lists each language by
// its own name instead (LANGUAGE_NAMES)
export function languageLabel(language: Language) {
  return englishNames.of(language) ?? language
}

// Throws when a save in the language failed, which the API reports as false (assertSaved)
export function assertTranslationSaved(results: unknown, language: Language) {
  assertSaved(results, `The ${languageLabel(language)} translation couldn't be saved. Check the required fields and try again.`)
}

// A record's translation in the language, if it has one
export function findTranslation<T extends { language: string }>(translations: readonly T[] | null | undefined, language: Language) {
  return translations?.find((translation) => translation.language === language)
}

// Whether the record has the language: English is always translated; another language is missing without an entry, a
// draft while its AI translation awaits review, and outdated when English changed after it was saved, which a draft can be
// too (outdated_draft)
export function translationStatus(translations: readonly TranslationStatusLike[] | null | undefined, language: Language): TranslationStatus {
  if (language === DEFAULT_LANGUAGE) return "translated"
  const translation = findTranslation(translations, language)
  if (!translation) return "missing"
  if (translation.draft) return translation.outdated ? "outdated_draft" : "draft"
  return translation.outdated ? "outdated" : "translated"
}

// Form values of a translation's content fields, an untranslated (null) or missing field reading as an empty string
export function contentValues<T extends object, K extends keyof T & string>(
  translation: T | null | undefined,
  fields: readonly K[]
): Record<K, string> {
  return Object.fromEntries(fields.map((field) => [field, (translation?.[field] as string | null | undefined) ?? ""])) as Record<K, string>
}

// How the AI translation describes a content field to the model, the same in the form's "Translate from English" and in
// bulk translation. Each record type's descriptions live next to its content fields (e.g. projectFieldDescriptions)
export interface FieldDescription {
  // What the field is, e.g. "Experience at Acme: position"
  label: string
  // Markdown, rather than a single line of plain text
  markdown?: boolean
}

// Values with the fields optional in every language and nullable, as a save in a language sends them
export type TranslationInput<T, K extends keyof T> = Omit<T, K> & { [P in K]?: Exclude<T[P], undefined> | null }

const isEmpty = (value: unknown) => value == null || (typeof value === "string" && value.trim() === "")

// Values to save in the language: outside English, the listed content fields left empty are sent as null, so they stay
// untranslated and read in English. English keeps its values as they are
export function untranslatedAsNull<T extends object, K extends keyof T>(values: T, fields: readonly K[], language: Language): TranslationInput<T, K> {
  if (language === DEFAULT_LANGUAGE) return values as TranslationInput<T, K>
  const nulls = Object.fromEntries(fields.filter((field) => isEmpty(values[field])).map((field) => [field, null]))
  return { ...values, ...nulls } as TranslationInput<T, K>
}

// Placeholder of a content field in the language. Outside English, when English has text (shown next to the field:
// EnglishText, EnglishReference), an optional field says that visitors read English while it is empty, and a required
// one has none, so it never looks filled in. Otherwise the form's own placeholder
export function untranslatedPlaceholder(
  language: Language,
  englishText: string | null | undefined,
  { required = false, placeholder }: { required?: boolean; placeholder?: string } = {}
) {
  if (language === DEFAULT_LANGUAGE || !englishText?.trim()) return placeholder
  return required ? undefined : "Not translated yet: visitors see the English text"
}

// What a record's nested items with their own translations (a team member's experiences, a project's contributions) need
// to tell their status
export interface NestedTranslatable {
  translations?: readonly TranslationStatusLike[] | null
}

// A record's nested items needing review in a language: how many are missing, drafts or outdated, how many of those are
// drafts, how many are outdated (drafts or not), and how many of the drafts were made before English last changed
export interface NestedNeedingReview {
  count: number
  drafts: number
  outdated: number
  outdatedDrafts: number
}

const NONE: NestedNeedingReview = { count: 0, drafts: 0, outdated: 0, outdatedDrafts: 0 }

// A record's nested items missing, drafts or outdated in the language. `hasEnglish` leaves out items English gives no
// text to translate, e.g. a contribution without a description
export function nestedNeedingReview<T extends NestedTranslatable>(
  items: readonly (T | null | undefined)[] | null | undefined,
  language: Language,
  hasEnglish: (item: T) => boolean = () => true
): NestedNeedingReview {
  const statuses = (items ?? []).flatMap((item) => (item && hasEnglish(item) ? [translationStatus(item.translations, language)] : []))
  const needing = statuses.filter((status) => status !== "translated")
  return {
    count: needing.length,
    drafts: needing.filter(isDraftStatus).length,
    outdated: needing.filter((status) => status === "outdated" || status === "outdated_draft").length,
    outdatedDrafts: needing.filter((status) => status === "outdated_draft").length,
  }
}

// What a bulk translation translates into a language: only what's missing there, or also the translations there that are
// outdated, AI drafts included, which it replaces with new drafts
export const BULK_TRANSLATE_MODES = ["missing", "missing_or_outdated"] as const
export type BulkTranslateMode = (typeof BULK_TRANSLATE_MODES)[number]

// Whether bulk translation translates a record or nested item with this translation in the language (findTranslation):
// it has none, not even a draft, or the mode re-translates outdated ones and it is
export function bulkTranslates(translation: TranslationStatusLike | null | undefined, mode: BulkTranslateMode) {
  return !translation || (mode === "missing_or_outdated" && translation.outdated)
}

// Whether a record has content to translate into the language in a bulk translation's mode (bulkTranslates): its own, or
// one of its nested items' with English text (`hasEnglish`)
export function needsBulkTranslation<T extends NestedTranslatable>(
  mode: BulkTranslateMode,
  translations: readonly TranslationStatusLike[] | null | undefined,
  language: Language,
  items?: readonly (T | null | undefined)[] | null,
  hasEnglish: (item: T) => boolean = () => true
) {
  if (language === DEFAULT_LANGUAGE) return false
  return (
    bulkTranslates(findTranslation(translations, language), mode) ||
    (items ?? []).some((item) => item && hasEnglish(item) && bulkTranslates(findTranslation(item.translations, language), mode))
  )
}

// Whether a nested item (an experience, a contribution) is outdated or a draft in the language and left as it was: neither
// opened nor changed. Saving it would mark it up to date, or publish the draft, unreviewed, so a translation save leaves it
// out. `content` holds the item's content fields as the save sends them (untranslatedAsNull)
export function isUnreviewed<T extends TranslationStatusLike>(
  translation: T | null | undefined,
  content: Partial<Record<keyof T, unknown>>,
  opened: boolean
) {
  if (!(translation?.outdated || translation?.draft) || opened) return false
  return Object.entries(content).every(([field, value]) => (value ?? null) === (translation[field as keyof T] ?? null))
}

// Nested items a translation save left out as unreviewed: outdated ones and drafts left as they were (isUnreviewed), and
// those the AI translation filled that nobody opened, whose AI text is dropped
export interface Unreviewed {
  unopened: number
  aiTranslated: number
}

// The success toast's note on nested items a translation save left out as unreviewed, e.g. "2 experiences weren't opened
// and still need review in Spanish. 1 AI-translated experience wasn't opened, so its Spanish translation wasn't saved."
export function unreviewedNote(
  { unopened, aiTranslated }: Unreviewed,
  { singular, plural }: { singular: string; plural: string },
  language: Language
) {
  const name = languageLabel(language)
  const notes = [
    unopened > 0 && `${countOf(unopened, `${singular} wasn't opened and still needs`, `${plural} weren't opened and still need`)} review in ${name}.`,
    aiTranslated > 0 &&
      `${countOf(aiTranslated, `AI-translated ${singular} wasn't opened, so its`, `AI-translated ${plural} weren't opened, so their`)} ${name} translation wasn't saved.`,
  ].filter(Boolean)
  return notes.length > 0 ? notes.join(" ") : undefined
}

// A count followed by its wording for one or for several, e.g. "2 experiences", for the admin's copy
export function countOf(count: number, singular: string, plural: string) {
  return `${count} ${count === 1 ? singular : plural}`
}

// A record's status in the language counting its nested items (nestedNeedingReview). Nested drafts make it a draft, even
// while its own translation is missing, so a record a bulk translation saved drafts for shows as one; a draft record is an
// outdated draft when it or any nested item is outdated, so the list never hides that English changed after a
// translation. Otherwise a missing, draft or outdated record keeps its status, and a translated
// one with nested items needing review reads outdated, as it needs reviewing too
export function recordTranslationStatus(
  translations: readonly TranslationStatusLike[] | null | undefined,
  language: Language,
  nested: NestedNeedingReview = NONE
): TranslationStatus {
  const status = translationStatus(translations, language)
  if (nested.drafts > 0 || isDraftStatus(status)) {
    const outdated = status === "outdated" || status === "outdated_draft" || nested.outdated > 0
    return outdated ? "outdated_draft" : "draft"
  }
  return status === "translated" && nested.count > 0 ? "outdated" : status
}

// Instructions for the AI writing assistant (AiEditor's prompt), written in English: outside English they also ask for
// text in the language being edited. The completion route appends its own sentence, so this ends without a period
export function improvePromptIn(prompt: string, language: Language) {
  if (language === DEFAULT_LANGUAGE) return prompt
  return `${prompt.replace(/[\s.]+$/, "")}. Write in ${languageLabel(language)}`
}

// A path with the language as its search parameter, e.g. to deep-link into a record's translation. English drops it
export function withLanguageParam(path: string, language: Language) {
  if (language === DEFAULT_LANGUAGE) return path
  const separator = path.includes("?") ? "&" : "?"
  return `${path}${separator}${LANGUAGE_PARAM}=${encodeURIComponent(language)}`
}
