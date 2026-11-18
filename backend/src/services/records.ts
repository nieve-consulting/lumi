import { clients, jobOpenings, projects, projectTeamMembers, teamMembers } from "@db/schema"
import { DEFAULT_LANGUAGE, LANGUAGES, TRANSLATION_LANGUAGES, type Language } from "@lumi/shared-contracts/language"
import { eq, sql, type AnyColumn, type SQL } from "drizzle-orm"
import type { PgColumn } from "drizzle-orm/pg-core"
import { z } from "zod"

import type { Queryable } from "./db"
import { conflict, invalidInput } from "./errors"
import { saveContent, splitContent, type loadContent, type TranslatedContent, type TranslatedRecord, type TranslationKey } from "./translations"
import { versionOf } from "./versions"

export const iso = (date: Date) => date.toISOString()
export const isoOrNull = (date: Date | null | undefined) => (date ? date.toISOString() : null)

export const idSchema = z.string().describe("Record id (UUID)")
export const timestampSchema = z.string().describe("ISO 8601 date-time")
export const versionSchema = z.string().describe("Opaque version; pass it as expected_version to update this record")

export const contentLanguageSchema = z
  .enum(LANGUAGES)
  .describe(
    "Language the content was returned in: the requested one, or English (en) when the record has no translation in it or only an AI draft, or for public reads when its translation is outdated"
  )

export const fallbackFieldsSchema = z
  .array(z.string())
  .describe(
    "Content fields returned in English because the translation in language leaves them untranslated; empty when the whole record came back in language"
  )

// The language a record's content was returned in, and which of its fields fell back to English
export const localizedShape = { language: contentLanguageSchema, fallback_fields: fallbackFieldsSchema }

// The language a record read with loadContent was returned in, and its fields that fell back to English: among `fields`
// when the read returns only some of the record's content, e.g. a capability's name
export function localizedAs({ language, fallback_fields }: { language: Language; fallback_fields: string[] }, fields?: readonly string[]) {
  return { language, fallback_fields: fields ? fallback_fields.filter((field) => fields.includes(field)) : fallback_fields }
}

export const translationStatusSchema = z
  .array(
    z.object({
      language: z.enum(LANGUAGES),
      updated_at: timestampSchema.describe("When the content in this language was last saved"),
      outdated: z.boolean().describe("True when the English content changed since this translation was saved, so it may need reviewing"),
      draft: z
        .boolean()
        .describe(
          "True for an AI translation awaiting the team's review in Lumi's admin interface: reads return English until it is published there. Its text is not returned, and an update in its language replaces it"
        ),
      fields: z
        .array(z.string())
        .describe(
          "Fields this language sets. In another language, the record's other fields read in English, even when language says it: fallback_fields lists those returned in English"
        ),
    })
  )
  .describe("Languages the record's content is written in, English first. Other languages read in English")

// The language an MCP update writes. Left undefined rather than defaulted, so a payload without it hashes for idempotency
// as before. Shared fields are written whatever it is: the patch names them explicitly and is checked against the version
export const writeLanguageField = z
  .enum(LANGUAGES)
  .optional()
  .describe(
    `Language the patch's text is written in, ${DEFAULT_LANGUAGE} (English) by default. Only that language's translatable fields are saved, so writing another language never changes English; fields shared by every language (names of clients and team members, slugs, URLs, dates, location, company, client, ...) are rejected in another language, as they change every language: change them in a separate update without language. In a language other than English, null or empty text on a text field leaves it untranslated so it reads in English; the record must have its English content. Ask the user which language they mean when it is unclear`
  )

// The record's text in a language other than English, given on creation with the English: the record's translatable fields
// with the same rules as in English, all optional, at least one of them set. Blank text is left untranslated
export function translationInput<T extends z.ZodRawShape>(shape: T) {
  return (
    z
      .strictObject({ language: z.enum(TRANSLATION_LANGUAGES).describe("Language of the translation, other than English") })
      .extend(z.object(shape).partial().shape)
      // Blank text is left untranslated, so it does not count
      .refine(
        (translation) =>
          Object.keys(shape).some((field) => {
            const value = (translation as Record<string, unknown>)[field]
            return typeof value === "string" && value.trim() !== ""
          }),
        { message: "The translation must set at least one text field" }
      )
      .optional()
      .describe(
        "The record's text in another language, saved with the English, which the record is returned in. It can also be added later with the update tool and its language"
      )
  )
}

// A patch in a language other than English only writes the record's translatable fields: the fields every language shares
// are changed in English, so translating a record never changes what the other languages show
export function assertTranslatablePatch(record: TranslatedRecord, language: Language | undefined, patch: Record<string, unknown>) {
  if (!language || language === DEFAULT_LANGUAGE) return
  const shared = Object.keys(splitContent(record, definedFields(patch)).shared)
  if (shared.length) {
    throw invalidInput(
      `${shared.join(", ")} ${shared.length > 1 ? "are" : "is"} shared by every language, so a patch in ${language} can't change ${shared.length > 1 ? "them" : "it"}. Leave ${shared.length > 1 ? "them" : "it"} out, or confirm with the user and change ${shared.length > 1 ? "them" : "it"} in a separate update without language; nothing was written.`,
      { shared_fields: shared }
    )
  }
}

// Saves the translation a creation was given, after the record's English content
export async function saveTranslation<R extends TranslatedRecord>(
  db: Queryable,
  record: R,
  key: TranslationKey<R>,
  translation: ({ language: Language } & Partial<Record<keyof TranslatedContent<R>, unknown>>) | undefined
) {
  if (!translation) return
  const { language, ...content } = translation
  await saveContent(db, record, key, language, content as Partial<TranslatedContent<R>>)
}

// The translations of records loaded with loadContent, to read them in a language
export type RecordContent<R extends TranslatedRecord> = Awaited<ReturnType<typeof loadContent<R>>>

// Which languages a record is written in and which fields each sets, without their content. A read in a language returns
// one language for the record, so the fields tell which ones fell back to English
export function translationStatus(translations: ({ language: Language; updated_at: Date; outdated: boolean; draft: boolean } & object)[]) {
  return translations.map(({ language, updated_at, outdated, draft, ...content }) => ({
    language,
    updated_at: iso(updated_at),
    outdated,
    draft,
    fields: Object.entries(content)
      .filter(([, value]) => value !== null && value !== undefined)
      .map(([field]) => field),
  }))
}

// A team member's contribution to a project, as both sides of the relationship return it
export const contributionFields = {
  description: z.string().nullable().describe("What the team member did on the project"),
  start_date: timestampSchema,
  end_date: timestampSchema.nullable().describe("null while the contribution is ongoing"),
}

// The team reads return the end date as written, which update_project_contribution edits
export const teamContributionFields = {
  ...contributionFields,
  end_date: timestampSchema.nullable().describe("null while ongoing; the contribution then ends with the project, at its end_date"),
}

// When a contribution ended, for a query joining its project. One without an end date ends with the project, so an ended
// project has no ongoing contributions, and one that started after the project ended (dates entered in different time
// zones) ends when it started
export const contributionEndDate: SQL<Date | null> = sql`case when ${projects.end_date} is null then ${projectTeamMembers.end_date}
  else coalesce(${projectTeamMembers.end_date}, greatest(${projects.end_date}, ${projectTeamMembers.start_date})) end`.mapWith(
  projectTeamMembers.end_date
)

// Version of a contribution: its dates and its description in every language (RecordContent's version), as both sides of the
// relationship return it
export const contributionVersion = (link: { start_date: Date; end_date: Date | null }, content: string) =>
  versionOf({ start_date: link.start_date, end_date: link.end_date, content })

export const expectedVersionField = z
  .string()
  .min(1)
  .max(100)
  .describe("version from your latest read of the record. The update is rejected with a conflict if the record changed since")

export const allowDuplicateNameField = z
  .boolean()
  .optional()
  .describe("Set to true only after the user confirmed that this is a different record from the existing ones with the same name")

// A field English requires, in a patch: null only leaves it untranslated in a language other than English, so it reads in
// English again
export const requiredContentPatchField = <T extends z.ZodType>(field: T) =>
  field
    .nullable()
    .optional()
    .describe(`${field.description ?? ""}. Required in English; null only in another language, to leave it untranslated so it reads in English`)

// Patches change only the fields they contain; omitted fields stay as they are, null clears a nullable field
export function patchSchema<T extends z.ZodRawShape>(shape: T) {
  return z
    .strictObject(shape)
    .refine((patch) => Object.values(patch).some((value) => value !== undefined), { message: "The patch must change at least one field" })
}

// Values of a patch, without the fields it omits
export function definedFields<T extends Record<string, unknown>>(patch: T): Partial<T> {
  return Object.fromEntries(Object.entries(patch).filter(([, value]) => value !== undefined)) as Partial<T>
}

export const sameNameCondition = (column: AnyColumn | SQL, name: string): SQL => sql`lower(trim(${column})) = lower(trim(${name}))`

// Creation never silently duplicates a record: an existing one with the same name is returned as a candidate to confirm against
export function assertNoSameName(entity: string, existing: { id: string; name: string }[], allowDuplicate: boolean | undefined) {
  if (existing.length > 0 && !allowDuplicate) {
    throw conflict(
      `A ${entity} with this name already exists. Check with the user whether they mean the existing ${entity}; if it is a different one, retry with allow_duplicate_name set to true.`,
      { candidates: existing.slice(0, 5) }
    )
  }
}

export function assertExists(entity: string, requested: string[], found: { id: string }[]) {
  const foundIds = new Set(found.map(({ id }) => id))
  const missing = requested.filter((id) => !foundIds.has(id))
  if (missing.length > 0) {
    throw invalidInput(`These ${entity} ids do not exist: ${missing.join(", ")}. Look them up with the team read tools; nothing was written.`, {
      missing_ids: missing,
    })
  }
}

// url_slug is unique per record type: another record using it is a conflict that names it by `name`, the record's name
// column or, for a translated name, its English expression
export async function assertSlugFree(
  db: Queryable,
  entity: string,
  table: typeof clients | typeof teamMembers | typeof projects | typeof jobOpenings,
  name: PgColumn | SQL<string>,
  slug: string,
  exceptId?: string
) {
  const [existing] = await db.select({ id: table.id, name }).from(table).where(eq(table.url_slug, slug))
  if (existing && existing.id !== exceptId) {
    throw conflict(`The ${entity} "${existing.name}" already uses the url_slug ${slug}. Choose a different slug, or update that ${entity} instead.`, {
      existing: { id: existing.id, name: existing.name },
    })
  }
}
