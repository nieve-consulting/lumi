import {
  capabilities,
  capabilityTranslations,
  clients,
  clientTranslations,
  company,
  companyTranslations,
  experience,
  experienceTranslations,
  jobOpenings,
  jobOpeningTranslations,
  projects,
  projectTeamMembers,
  projectTeamMemberTranslations,
  projectTranslations,
  teamMembers,
  teamMemberTranslations,
} from "@db/schema"
import { DEFAULT_LANGUAGE, LANGUAGES, type Language } from "@lumi/shared-contracts/language"
import { and, eq, getTableColumns, inArray, isNull, or, sql, type SQL, type SQLWrapper } from "drizzle-orm"
import type { PgColumn, PgTable } from "drizzle-orm/pg-core"

import type { Queryable } from "./db"
import { invalidInput, notFound } from "./errors"
import { MAX_LONG_TEXT } from "./rules"
import { versionOf } from "./versions"

// Record content lives only in the <entity>_translations tables (db/schema.ts), one row per record and language. Reads
// take it in the requested language, falling back to English field by field (loadContent, contentSql); writes save one
// language at a time (saveContent), so saving one language never changes another. A draft translation (saveDraft) awaits
// the team's review: reads skip it as if the record had no translation in its language, until a save publishes it

interface TranslatedTable {
  record: PgTable
  translations: PgTable
  // Each key column of the translations by the record column it refers to
  keys: Record<string, PgColumn>
  // Fields every record must have, which English always sets
  required: readonly string[]
}

const translatedTables = {
  company: { record: company, translations: companyTranslations, keys: { company_id: company.id }, required: [] },
  teamMember: {
    record: teamMembers,
    translations: teamMemberTranslations,
    keys: { team_member_id: teamMembers.id },
    required: ["job_title"],
  },
  experience: {
    record: experience,
    translations: experienceTranslations,
    keys: { experience_id: experience.id },
    required: ["position"],
  },
  capability: { record: capabilities, translations: capabilityTranslations, keys: { capability_id: capabilities.id }, required: ["name"] },
  client: { record: clients, translations: clientTranslations, keys: { client_id: clients.id }, required: ["summary"] },
  project: { record: projects, translations: projectTranslations, keys: { project_id: projects.id }, required: ["name"] },
  // The table only checks the title; saveContent keeps the English summary from being cleared too
  jobOpening: {
    record: jobOpenings,
    translations: jobOpeningTranslations,
    keys: { job_opening_id: jobOpenings.id },
    required: ["title", "summary"],
  },
  projectTeamMember: {
    record: projectTeamMembers,
    translations: projectTeamMemberTranslations,
    keys: { team_member_id: projectTeamMembers.team_member_id, project_id: projectTeamMembers.project_id },
    required: [],
  },
} as const satisfies Record<string, TranslatedTable>

type TranslatedTables = typeof translatedTables

export type TranslatedRecord = keyof TranslatedTables

type TranslationRow<R extends TranslatedRecord> = TranslatedTables[R]["translations"]["$inferSelect"]

type KeyName<R extends TranslatedRecord> = keyof TranslatedTables[R]["keys"] & keyof TranslationRow<R>

// Columns of a translation that are not the record's content
const metadataColumns = ["language", "created_at", "updated_at", "source_version", "draft"] as const

// The record a translation belongs to, by the translation's key columns, e.g. { project_id }
export type TranslationKey<R extends TranslatedRecord> = Pick<TranslationRow<R>, KeyName<R>>

// The translatable fields of a record, as one language stores them: null when the field is not translated
export type TranslatedContent<R extends TranslatedRecord> = Omit<TranslationRow<R>, KeyName<R> | (typeof metadataColumns)[number]>

type RequiredField<R extends TranslatedRecord> = TranslatedTables[R]["required"][number] & keyof TranslatedContent<R>

// A record's content as reads return it, after falling back to English: the fields English requires are always set
export type LocalizedContent<R extends TranslatedRecord> = Omit<TranslatedContent<R>, RequiredField<R>> & {
  [F in RequiredField<R>]: NonNullable<TranslatedContent<R>[F]>
}

// One language of a record, as the admin edits it
export type RecordTranslation<R extends TranslatedRecord> = TranslatedContent<R> & {
  language: Language
  updated_at: Date
  // English's content changed since the translation was saved, so it may need reviewing. Always false in English
  outdated: boolean
  // An AI translation saved for review, which reads skip. Always false in English
  draft: boolean
}

// Keys of the translatable fields of a record type
export function contentKeys(record: TranslatedRecord): string[] {
  const { translations, keys }: TranslatedTable = translatedTables[record]
  return Object.keys(getTableColumns(translations)).filter((key) => !(key in keys) && !(metadataColumns as readonly string[]).includes(key))
}

// Most characters a translatable field stores: its column's length, or MAX_LONG_TEXT for unbounded text
function contentMaxLength(record: TranslatedRecord, field: string): number {
  const { translations }: TranslatedTable = translatedTables[record]
  const length = (getTableColumns(translations)[field] as { length?: unknown } | undefined)?.length
  return typeof length === "number" ? length : MAX_LONG_TEXT
}

function keyString(record: TranslatedRecord, key: Record<string, unknown>) {
  return Object.keys(translatedTables[record].keys)
    .map((column) => String(key[column]))
    .join(":")
}

function keyCondition(record: TranslatedRecord, key: Record<string, unknown>) {
  const { translations, keys }: TranslatedTable = translatedTables[record]
  const columns = getTableColumns(translations)
  return and(...Object.keys(keys).map((column) => eq(columns[column], key[column])))
}

// Version of a translation's content. A translation written from English records English's version as its source_version
function contentVersion(record: TranslatedRecord, translation: Record<string, unknown>) {
  return versionOf(Object.fromEntries(contentKeys(record).map((key) => [key, translation[key]])))
}

// The language content is read in. With `current`, a translation English changed after it was saved (it is outdated) reads
// as English, for Lumi, which must not state facts the team has since corrected. Searches and sorting still use it
export type ReadLanguage = Language | { language: Language; current: true }

// Reads content in the language, but outdated translations in English
export const currentContent = (language: Language): ReadLanguage => ({ language, current: true })

function readOptions(read: ReadLanguage = DEFAULT_LANGUAGE) {
  return typeof read === "string" ? { language: read, current: false } : read
}

// The language content is requested in, whatever each record is returned in
export const requestedLanguage = (read?: ReadLanguage) => readOptions(read).language

// A translation English changed since it was saved, by the version of English's content
function isOutdated(translation: { language: string; source_version: string | null }, englishVersion: string | undefined) {
  return translation.language !== DEFAULT_LANGUAGE && englishVersion !== undefined && translation.source_version !== englishVersion
}

// A field with text to read or translate, not null or blank
const hasText = (value: unknown) => value !== null && value !== undefined && !(typeof value === "string" && !value.trim())

// Splits a record's values into the fields shared by every language and its translatable content
export function splitContent<R extends TranslatedRecord, T extends Record<string, unknown>>(record: R, values: T) {
  const content = new Set(contentKeys(record))
  const entries = Object.entries(values)

  return {
    shared: Object.fromEntries(entries.filter(([key]) => !content.has(key))) as Omit<T, keyof TranslatedContent<R>>,
    content: Object.fromEntries(entries.filter(([key]) => content.has(key))) as Partial<TranslatedContent<R>>,
  }
}

// A record's field in the language, falling back to English when it is not translated or only has a draft, as an expression
// on the record table for searches, sorting and selections
export function contentSql<R extends TranslatedRecord, F extends keyof TranslatedContent<R> & string>(record: R, field: F, read?: ReadLanguage) {
  const { language } = readOptions(read)
  const { translations, keys }: TranslatedTable = translatedTables[record]
  const columns = getTableColumns(translations)
  const sameRecord = Object.entries(keys).map(([key, recordColumn]) => eq(columns[key], recordColumn))
  const inLanguage = (value: Language) =>
    sql`(select ${columns[field]} from ${translations} where ${and(...sameRecord, eq(columns.language, value), eq(columns.draft, false))})`

  const expression =
    language === DEFAULT_LANGUAGE ? inLanguage(DEFAULT_LANGUAGE) : sql`coalesce(${inLanguage(language)}, ${inLanguage(DEFAULT_LANGUAGE)})`
  return expression as SQL<LocalizedContent<R>[F & keyof LocalizedContent<R>]>
}

// Loads the translations of the records `where` selects (a condition on the translations table, or every record without
// one), to read them in `read`'s language
export async function loadContent<R extends TranslatedRecord>(db: Queryable, record: R, where: SQL | undefined, read?: ReadLanguage) {
  const { language, current } = readOptions(read)
  const { translations, required }: TranslatedTable = translatedTables[record]
  const rows = (await db.select().from(translations).where(where)) as TranslationRow<R>[]

  const byRecord = new Map<string, TranslationRow<R>[]>()
  for (const row of rows) {
    // The table takes any language code, but only supported languages can be read or listed
    if (!(LANGUAGES as readonly string[]).includes(row.language)) continue

    const key = keyString(record, row)
    byRecord.set(key, [...(byRecord.get(key) ?? []), row])
  }
  const translationsOf = (key: TranslationKey<R>) => byRecord.get(keyString(record, key)) ?? []
  const fields = contentKeys(record)

  return {
    // The target with the record's content in `language`. A field that language leaves untranslated (null) falls back to
    // English; a record with no translation in it, only a draft, or an outdated one when reading current content, is
    // returned in English. `language` tells which language was returned, and `fallback_fields` which of its fields English
    // filled in: those the translation leaves untranslated that English has text for, none when it is English
    localize<T extends object>(
      target: T,
      key: TranslationKey<R>
    ): Omit<T, keyof LocalizedContent<R>> & LocalizedContent<R> & { language: Language; fallback_fields: string[] } {
      const rows = translationsOf(key)
      const english = rows.find((row) => row.language === DEFAULT_LANGUAGE) as Record<string, unknown> | undefined
      const translation = rows.find((row) => row.language === language && !row.draft)
      const outdated = current && translation && english && isOutdated(translation, contentVersion(record, english))
      const requested = (outdated ? undefined : translation) as Record<string, unknown> | undefined
      // English sets the required fields, so they are only empty for a record missing its English translation
      const content = Object.fromEntries(
        fields.map((field) => [field, requested?.[field] ?? english?.[field] ?? (required.includes(field) ? "" : null)])
      ) as LocalizedContent<R>
      const returned = requested ? language : DEFAULT_LANGUAGE
      const fallback_fields =
        returned === DEFAULT_LANGUAGE ? [] : fields.filter((field) => (requested?.[field] ?? null) === null && hasText(english?.[field]))

      return { ...target, ...content, language: returned, fallback_fields }
    },

    // Every language the record has, drafts included, in LANGUAGES order, flagging translations English changed after
    translations(key: TranslationKey<R>): RecordTranslation<R>[] {
      const rows = translationsOf(key)
      const english = rows.find((row) => row.language === DEFAULT_LANGUAGE)
      const englishVersion = english ? contentVersion(record, english) : undefined

      return [...rows]
        .sort((a, b) => LANGUAGES.indexOf(a.language) - LANGUAGES.indexOf(b.language))
        .map((row) => {
          const translation = row as Record<string, unknown>
          return {
            ...(Object.fromEntries(fields.map((field) => [field, translation[field]])) as TranslatedContent<R>),
            language: row.language,
            updated_at: row.updated_at,
            outdated: isOutdated(row, englishVersion),
            draft: row.draft,
          }
        })
    },

    // Version of the record's content in every language, and of which languages are drafts. Record versions include it, so
    // saving any language changes them, as does publishing a draft unchanged, which changes what reads return. A published
    // translation hashes its content alone, so versions read before drafts existed stay valid
    version(key: TranslationKey<R>) {
      return versionOf(
        Object.fromEntries(
          translationsOf(key).map((row) => {
            const content = contentVersion(record, row as Record<string, unknown>)
            return [row.language, row.draft ? versionOf({ content, draft: true }) : content]
          })
        )
      )
    },
  }
}

// Record types whose translations are keyed by one id column
export type SingleKeyRecord = Exclude<TranslatedRecord, "projectTeamMember">

// The translation key of a record with one key column, e.g. { project_id: id }
export function keyOf<R extends SingleKeyRecord>(record: R, id: string) {
  const [column] = Object.keys(translatedTables[record].keys)
  return { [column]: id } as TranslationKey<R>
}

// Loads the translations of the records with the ids (a list or a query selecting them), to read them in `read`'s language
export function loadContentOf<R extends SingleKeyRecord>(db: Queryable, record: R, ids: string[] | SQLWrapper, read?: ReadLanguage) {
  const { translations, keys }: TranslatedTable = translatedTables[record]
  const [column] = Object.keys(keys)
  return loadContent(db, record, inArray(getTableColumns(translations)[column], ids), read)
}

// Records with no translation in the language, as a condition on the record table. A draft counts as a translation, so
// the records it lists are those still left to translate
export function missingTranslation(record: TranslatedRecord, language: Language): SQL {
  const { translations, keys }: TranslatedTable = translatedTables[record]
  const columns = getTableColumns(translations)
  const sameRecord = Object.entries(keys).map(([key, recordColumn]) => eq(columns[key], recordColumn))

  return sql`not exists (select 1 from ${translations} where ${and(...sameRecord, eq(columns.language, language))})`
}

// Records with English text to translate and no translation in the language, as a condition on the record table: the
// nested items (a project's contributions, a team member's experiences) that leave their parent with content to translate.
// One without English text, e.g. a contribution without a description, has nothing to translate
export function missingTranslationOfText(record: TranslatedRecord, language: Language): SQL {
  const { translations, keys }: TranslatedTable = translatedTables[record]
  const columns = getTableColumns(translations)
  const sameRecord = Object.entries(keys).map(([key, recordColumn]) => eq(columns[key], recordColumn))
  const withText = or(...contentKeys(record).map((field) => sql`nullif(trim(${columns[field]}), '') is not null`))

  return and(
    sql`exists (select 1 from ${translations} where ${and(...sameRecord, eq(columns.language, DEFAULT_LANGUAGE), withText)})`,
    missingTranslation(record, language)
  )!
}

// Saves a record's content in one language, without changing the other languages. Fields the content omits keep their
// current value; null, or blank text, leaves a field of another language untranslated, so it reads as its English text
// rather than empty.
// - English is the record's own content: a new record must set every field English requires, which can't be cleared.
// - Another language needs the record's English translation, and records the version of English it was written from, so
//   it reads as outdated once English changes. Saving a draft publishes it, unless `replaceDraft` replaces it with the
//   content alone, for writers that never saw the draft: its fields the content omits are left untranslated rather than
//   published unreviewed
export async function saveContent<R extends TranslatedRecord>(
  db: Queryable,
  record: R,
  key: TranslationKey<R>,
  language: Language,
  content: Partial<TranslatedContent<R>>,
  { replaceDraft = false }: { replaceDraft?: boolean } = {}
) {
  const { translations, keys, required }: TranslatedTable = translatedTables[record]
  const columns = getTableColumns(translations)
  const fields = new Set(contentKeys(record))
  const untranslated = (value: unknown) => language !== DEFAULT_LANGUAGE && typeof value === "string" && !value.trim()
  const values = Object.fromEntries(
    Object.entries(content)
      .filter(([field, value]) => fields.has(field) && value !== undefined)
      .map(([field, value]) => [field, untranslated(value) ? null : value])
  )
  const rows = (await db
    .select()
    .from(translations)
    .where(and(keyCondition(record, key), inArray(columns.language, [DEFAULT_LANGUAGE, language])))) as Record<string, unknown>[]
  const english = rows.find((row) => row.language === DEFAULT_LANGUAGE)

  if (language === DEFAULT_LANGUAGE) {
    const cleared = required.filter((field) => values[field] === null)
    if (cleared.length) {
      throw invalidInput(
        `${cleared.join(", ")} can't be empty in English, the record's own content: null only leaves a field untranslated in another language.`
      )
    }
    // Updated rather than upserted, as the check on required English fields applies to the row an upsert proposes
    if (!english) {
      await db.insert(translations).values({ ...key, ...values, language })
    } else if (Object.keys(values).length) {
      await db
        .update(translations)
        .set({ ...values, updated_at: sql`now()` })
        .where(and(keyCondition(record, key), eq(columns.language, language)))
    }
    return
  }

  if (!english) throw notFound(record, keyString(record, key))
  // Nothing to save, as an empty translation would count the record as translated in the language
  if (Object.keys(values).length === 0) return
  // The translation is written from the current English once the save covers every field it translates. A save of only
  // some fields keeps the version the others were written from, so the translation still reads as outdated
  const current = rows.find((row) => row.language === language)
  const saved = replaceDraft && current?.draft ? { ...Object.fromEntries(contentKeys(record).map((field) => [field, null])), ...values } : values
  const complete = !current || contentKeys(record).every((field) => field in saved || current[field] === null)
  const source_version = complete ? contentVersion(record, english) : (current.source_version as string | null)

  await db
    .insert(translations)
    .values({ ...key, ...saved, language, source_version, draft: false })
    .onConflictDoUpdate({
      target: [...Object.keys(keys).map((column) => columns[column]), columns.language],
      set: { ...saved, source_version, draft: false, updated_at: sql`now()` },
    })
  // A translation left with no field translated is removed, so the record reads as untranslated in the language
  if (Object.values(saved).some((value) => value === null)) {
    await db
      .delete(translations)
      .where(and(keyCondition(record, key), eq(columns.language, language), ...contentKeys(record).map((field) => isNull(columns[field]))))
  }
}

// A record's translation to save as a draft: its content by field, text only, and the English text of each field it was
// translated from
export interface TranslationDraft<R extends TranslatedRecord = TranslatedRecord> {
  record: R
  key: TranslationKey<R>
  content: Partial<Record<keyof TranslatedContent<R> & string, string>>
  source: Partial<Record<keyof TranslatedContent<R> & string, string>>
}

// Saves a translation into a language other than English as a draft for the team to review, written from English as
// `source` gives its fields: English changed since then reads as outdated, as for any translation. Only a record with no
// translation in the language yet gets one, so a translation saved meanwhile is never replaced; with `replaceOutdated`, so
// does one whose translation English changed after (it is outdated), reviewed or a draft, which becomes the draft: its
// fields the draft leaves out keep their text for review, unless English has none, and then keep it outdated. An
// up-to-date translation is always kept. Empty text, or text longer than its field stores, leaves the field untranslated
// for the team to fill in.
// Returns whether the draft was saved, and how many of its fields were left untranslated
export async function saveDraft<R extends TranslatedRecord>(
  db: Queryable,
  record: R,
  key: TranslationKey<R>,
  language: Language,
  content: TranslationDraft<R>["content"],
  source: TranslationDraft<R>["source"],
  { replaceOutdated = false }: { replaceOutdated?: boolean } = {}
) {
  if (language === DEFAULT_LANGUAGE) throw invalidInput("English is the record's own content, so it can't be saved as a draft.")
  const { translations, keys }: TranslatedTable = translatedTables[record]
  const columns = getTableColumns(translations)
  const fields = new Set(contentKeys(record))
  const given = Object.entries(content as Record<string, string | undefined>).filter(([field]) => fields.has(field))
  const values = Object.fromEntries(given.filter(([field, text]) => text?.trim() && text.length <= contentMaxLength(record, field)))
  const untranslated = given.length - Object.keys(values).length
  // Nothing to save, as an empty draft would count the record as translated in the language
  if (Object.keys(values).length === 0) return { saved: false, untranslated }

  // To replace an outdated translation, it is read locked with English, so that neither changes until the draft is saved: a
  // save of either made meanwhile is read here, or waits for the draft and then applies over it
  const query = db
    .select()
    .from(translations)
    .where(and(keyCondition(record, key), inArray(columns.language, replaceOutdated ? [DEFAULT_LANGUAGE, language] : [DEFAULT_LANGUAGE])))
  const rows = (await (replaceOutdated ? query.for("update") : query)) as Record<string, unknown>[]
  const english = rows.find((row) => row.language === DEFAULT_LANGUAGE)
  if (!english) throw notFound(record, keyString(record, key))
  // A field English no longer has text in, cleared since the draft was translated, has nothing to translate: its translation
  // of the old text is left out, and so is that text from the version the draft was written from
  const cleared = (field: string) => !hasText(english[field])
  const draft = Object.fromEntries(Object.entries(values).filter(([field]) => !cleared(field)))
  if (Object.keys(draft).length === 0) return { saved: false, untranslated }
  const source_version = contentVersion(record, { ...english, ...Object.fromEntries(Object.entries(source).filter(([field]) => !cleared(field))) })

  const current = rows.find((row) => row.language === language) as { language: string; source_version: string | null } | undefined
  if (current) {
    // An up-to-date translation is kept, so none of the draft's fields is left for the team
    if (!isOutdated(current, contentVersion(record, english))) return { saved: false, untranslated: 0 }
    // Fields English no longer has text for are left untranslated; the others the draft leaves out keep their text, so the
    // team reviews it rather than losing it
    const withoutEnglish = Object.fromEntries([...fields].filter(cleared).map((field) => [field, null]))
    // As in saveContent, the draft is written from the current English once it covers every field English has text in: a
    // field it leaves out keeps the outdated text, so the draft keeps the version that text was written from and still
    // reads as outdated
    const complete = [...fields].every((field) => field in draft || field in withoutEnglish)
    await db
      .update(translations)
      .set({
        ...withoutEnglish,
        ...draft,
        source_version: complete ? source_version : current.source_version,
        draft: true,
        updated_at: sql`now()`,
      })
      .where(and(keyCondition(record, key), eq(columns.language, language)))
    return { saved: true, untranslated }
  }

  const saved = await db
    .insert(translations)
    .values({ ...key, ...draft, language, source_version, draft: true })
    .onConflictDoNothing({ target: [...Object.keys(keys).map((column) => columns[column]), columns.language] })
    .returning({ language: columns.language })
  // A translation saved meanwhile is kept, so none of the draft's fields is left for the team
  return saved.length > 0 ? { saved: true, untranslated } : { saved: false, untranslated: 0 }
}
