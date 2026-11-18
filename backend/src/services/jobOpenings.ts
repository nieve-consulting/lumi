import { jobOpenings } from "@db/schema"
import { JOB_WORK_MODES } from "@lumi/shared-contracts/knowledge"
import { DEFAULT_LANGUAGE } from "@lumi/shared-contracts/language"
import { and, asc, desc, eq, ilike, or } from "drizzle-orm"
import { z } from "zod"

import { requireTeam, type ServiceContext } from "./context"
import type { Queryable } from "./db"
import { mapDbError, notFound } from "./errors"
import { idempotencyKeyField, runMutation } from "./mutations"
import {
  containsPattern,
  listInputShape,
  pageSchema,
  pageWindow,
  type DetailOptions,
  type ListInput,
  type ListOptions,
  type TeamListOptions,
} from "./pagination"
import {
  assertSlugFree,
  assertTranslatablePatch,
  definedFields,
  expectedVersionField,
  idSchema,
  iso,
  localizedAs,
  localizedShape,
  patchSchema,
  requiredContentPatchField,
  saveTranslation,
  timestampSchema,
  translationInput,
  translationStatus,
  translationStatusSchema,
  versionSchema,
  writeLanguageField,
  type RecordContent,
} from "./records"
import { dateField, longTextField, nameField, slugField, toDate, urlField, uuidField } from "./rules"
import { contentSql, loadContentOf, missingTranslation, saveContent, splitContent, type ReadLanguage } from "./translations"
import { assertVersion, versionOf } from "./versions"
import { isPublicJobOpening } from "./visibility"

// Job openings are the positions the business recruits for. Their title, summary and description are translated; the
// location, work mode, application link and posting date are shared by every language. Public lists show the most recently
// posted first

// Schemas

export const jobWorkModeSchema = z.enum(JOB_WORK_MODES).describe("Where the work happens: REMOTE, HYBRID or ONSITE")

export const publicJobOpeningSummarySchema = z.object({
  id: idSchema,
  url_slug: z.string(),
  title: z.string(),
  summary: z.string().describe("One or two sentences about the role"),
  location: z.string().describe("Where the work is based"),
  work_mode: jobWorkModeSchema,
  application_url: z.string().nullable().describe("Where candidates apply; null to point them to the business's careers page"),
  posted_at: timestampSchema.describe("When the opening was posted"),
  ...localizedShape,
})

export const publicJobOpeningSchema = publicJobOpeningSummarySchema.extend({
  description: z.string().nullable().describe("The full description of the role (markdown)"),
})

const teamJobOpeningFields = {
  published: z.boolean().describe("Approved for external disclosure; changed with publish_record and unpublish_record"),
  translations: translationStatusSchema,
  version: versionSchema,
  created_at: timestampSchema,
  updated_at: timestampSchema,
}

export const teamJobOpeningSummarySchema = publicJobOpeningSummarySchema.extend(teamJobOpeningFields)

export const teamJobOpeningSchema = publicJobOpeningSchema.extend(teamJobOpeningFields)

export type PublicJobOpeningSummary = z.infer<typeof publicJobOpeningSummarySchema>
export type PublicJobOpening = z.infer<typeof publicJobOpeningSchema>
export type TeamJobOpening = z.infer<typeof teamJobOpeningSchema>

export const publicJobOpeningPageSchema = pageSchema(publicJobOpeningSummarySchema)
export const teamJobOpeningPageSchema = pageSchema(teamJobOpeningSummarySchema)

export const jobOpeningListInput = z.object(listInputShape)

const jobOpeningFields = {
  title: nameField("Title of the role, e.g. Senior Data Engineer"),
  summary: z.string().trim().min(1, "Must not be empty").max(2000).describe("One or two sentences about the role"),
  url_slug: slugField,
  description: longTextField("The full description of the role: responsibilities, requirements, what the business offers (markdown)"),
  location: nameField("Where the work is based, e.g. Madrid, Spain. Shared by every language"),
  work_mode: jobWorkModeSchema,
  application_url: urlField("Where candidates apply for this opening; omit to point them to the careers page from the business settings"),
  posted_at: dateField("When the opening was posted"),
}

export const createJobOpeningInput = z.object({
  title: jobOpeningFields.title,
  summary: jobOpeningFields.summary,
  url_slug: jobOpeningFields.url_slug,
  description: jobOpeningFields.description.optional(),
  location: jobOpeningFields.location,
  work_mode: jobOpeningFields.work_mode,
  application_url: jobOpeningFields.application_url.optional(),
  posted_at: jobOpeningFields.posted_at,
  translation: translationInput({ title: jobOpeningFields.title, summary: jobOpeningFields.summary, description: jobOpeningFields.description }),
  idempotency_key: idempotencyKeyField,
})

export const updateJobOpeningInput = z.object({
  id: uuidField("Job opening id from admin_get_job_openings"),
  expected_version: expectedVersionField,
  language: writeLanguageField,
  patch: patchSchema({
    title: requiredContentPatchField(jobOpeningFields.title),
    summary: requiredContentPatchField(jobOpeningFields.summary),
    url_slug: jobOpeningFields.url_slug.optional(),
    description: jobOpeningFields.description.nullable().optional(),
    location: jobOpeningFields.location.optional(),
    work_mode: jobOpeningFields.work_mode.optional(),
    application_url: jobOpeningFields.application_url.nullable().optional(),
    posted_at: jobOpeningFields.posted_at.optional(),
  }),
  idempotency_key: idempotencyKeyField,
})

// Queries

// A job opening's content is read from its translations with jobOpeningContent
type JobOpeningRow = typeof jobOpenings.$inferSelect

// Covers the job opening's content in every language, so saving any language changes it
const jobOpeningVersion = (jobOpening: JobOpeningRow, content: string) =>
  versionOf({
    url_slug: jobOpening.url_slug,
    location: jobOpening.location,
    work_mode: jobOpening.work_mode,
    application_url: jobOpening.application_url,
    posted_at: jobOpening.posted_at,
    published: jobOpening.published,
    content,
  })

type JobOpeningContent = RecordContent<"jobOpening">

// Translations of the job openings, to read them in the language
const jobOpeningContent = (db: Queryable, ids: string[], language?: ReadLanguage) => loadContentOf(db, "jobOpening", ids, language)

// The job opening's content in the content's language
const localizeJobOpening = (jobOpening: JobOpeningRow, content: JobOpeningContent) => content.localize(jobOpening, { job_opening_id: jobOpening.id })

// Content fields a job opening summary returns; the details return them all
const summaryContent = ["title", "summary"]

function toPublicSummary(jobOpening: ReturnType<typeof localizeJobOpening>, { detail = false } = {}): PublicJobOpeningSummary {
  return {
    id: jobOpening.id,
    url_slug: jobOpening.url_slug,
    title: jobOpening.title,
    summary: jobOpening.summary,
    location: jobOpening.location,
    work_mode: jobOpening.work_mode,
    application_url: jobOpening.application_url,
    posted_at: iso(jobOpening.posted_at),
    ...localizedAs(jobOpening, detail ? undefined : summaryContent),
  }
}

function toPublic(jobOpening: ReturnType<typeof localizeJobOpening>): PublicJobOpening {
  return { ...toPublicSummary(jobOpening, { detail: true }), description: jobOpening.description }
}

function toTeamFields(jobOpening: JobOpeningRow, content: JobOpeningContent) {
  return {
    published: jobOpening.published,
    translations: translationStatus(content.translations({ job_opening_id: jobOpening.id })),
    version: jobOpeningVersion(jobOpening, content.version({ job_opening_id: jobOpening.id })),
    created_at: iso(jobOpening.created_at),
    updated_at: iso(jobOpening.updated_at),
  }
}

// Matches the title or summary in the language, or in English where they are not translated, and the location
function searchCondition(query: string | undefined, language?: ReadLanguage) {
  if (!query) return undefined
  const pattern = containsPattern(query)
  return or(
    ilike(contentSql("jobOpening", "title", language), pattern),
    ilike(contentSql("jobOpening", "summary", language), pattern),
    ilike(jobOpenings.location, pattern)
  )
}

// Most recently posted first
const listOrder = [desc(jobOpenings.posted_at), asc(jobOpenings.id)]

export async function loadTeamJobOpening(db: Queryable, id: string, language?: ReadLanguage): Promise<TeamJobOpening> {
  const [jobOpening] = await db.select().from(jobOpenings).where(eq(jobOpenings.id, id))
  if (!jobOpening) throw notFound("job opening", id)

  const content = await jobOpeningContent(db, [id], language)
  return { ...toPublic(localizeJobOpening(jobOpening, content)), ...toTeamFields(jobOpening, content) }
}

// Public reads

export async function listPublicJobOpenings(ctx: ServiceContext, input: ListInput, { language }: ListOptions = {}) {
  const window = pageWindow(input, { query: input.query, language })
  const rows = await ctx.db
    .select()
    .from(jobOpenings)
    .where(and(isPublicJobOpening, searchCondition(input.query, language)))
    .orderBy(...listOrder)
    .limit(window.fetch)
    .offset(window.offset)
  const content = await jobOpeningContent(
    ctx.db,
    rows.map(({ id }) => id),
    language
  )

  return window.toPage(rows.map((jobOpening) => toPublicSummary(localizeJobOpening(jobOpening, content))))
}

// An unpublished job opening is not found, like a missing id
export async function getPublicJobOpening(ctx: ServiceContext, id: string, { language }: DetailOptions = {}): Promise<PublicJobOpening> {
  const [jobOpening] = await ctx.db
    .select()
    .from(jobOpenings)
    .where(and(eq(jobOpenings.id, id), isPublicJobOpening))
  if (!jobOpening) throw notFound("job opening", id)

  const content = await jobOpeningContent(ctx.db, [id], language)
  return toPublic(localizeJobOpening(jobOpening, content))
}

// Team reads

export async function listTeamJobOpenings(ctx: ServiceContext, input: ListInput, { language, missingLanguage }: TeamListOptions = {}) {
  requireTeam(ctx, "read")
  const window = pageWindow(input, { query: input.query, language, missing_language: missingLanguage })
  const rows = await ctx.db
    .select()
    .from(jobOpenings)
    .where(and(searchCondition(input.query, language), missingLanguage ? missingTranslation("jobOpening", missingLanguage) : undefined))
    .orderBy(...listOrder)
    .limit(window.fetch)
    .offset(window.offset)
  const content = await jobOpeningContent(
    ctx.db,
    rows.map(({ id }) => id),
    language
  )

  return window.toPage(
    rows.map((jobOpening) => ({ ...toPublicSummary(localizeJobOpening(jobOpening, content)), ...toTeamFields(jobOpening, content) }))
  )
}

export async function getTeamJobOpening(ctx: ServiceContext, id: string, { language }: DetailOptions = {}) {
  requireTeam(ctx, "read")
  return loadTeamJobOpening(ctx.db, id, language)
}

// Team writes

// Another job opening using the slug is a conflict that names it by its English title. The admin GraphQL saves check it too
const englishTitle = contentSql("jobOpening", "title", DEFAULT_LANGUAGE)

export const assertJobOpeningSlugFree = (db: Queryable, slug: string, exceptId?: string) =>
  assertSlugFree(db, "job opening", jobOpenings, englishTitle, slug, exceptId)

export async function createJobOpening(ctx: ServiceContext, { idempotency_key, ...payload }: z.infer<typeof createJobOpeningInput>) {
  return runMutation(ctx, { operation: "create_job_opening", idempotencyKey: idempotency_key, payload, recordType: "job_opening" }, async (tx) => {
    await assertJobOpeningSlugFree(tx, payload.url_slug)

    const [{ id }] = await tx
      .insert(jobOpenings)
      .values({
        url_slug: payload.url_slug,
        location: payload.location,
        work_mode: payload.work_mode,
        application_url: payload.application_url,
        posted_at: toDate(payload.posted_at),
      })
      .returning({ id: jobOpenings.id })
      .catch((error) => mapDbError(error, "job opening"))
    await saveContent(tx, "jobOpening", { job_opening_id: id }, DEFAULT_LANGUAGE, {
      title: payload.title,
      summary: payload.summary,
      description: payload.description,
    })
    await saveTranslation(tx, "jobOpening", { job_opening_id: id }, payload.translation)

    return loadTeamJobOpening(tx, id)
  })
}

export async function updateJobOpening(ctx: ServiceContext, { idempotency_key, ...payload }: z.infer<typeof updateJobOpeningInput>) {
  return runMutation(
    ctx,
    { operation: "update_job_opening", idempotencyKey: idempotency_key, payload, recordType: "job_opening", recordId: payload.id },
    async (tx) => {
      assertTranslatablePatch("jobOpening", payload.language, payload.patch)
      const [current] = await tx.select().from(jobOpenings).where(eq(jobOpenings.id, payload.id)).for("update")
      if (!current) throw notFound("job opening", payload.id)
      const content = await jobOpeningContent(tx, [payload.id])
      assertVersion(payload.expected_version, jobOpeningVersion(current, content.version({ job_opening_id: payload.id })), "job opening")
      if (payload.patch.url_slug) await assertJobOpeningSlugFree(tx, payload.patch.url_slug, payload.id)

      const { posted_at, ...patch } = definedFields(payload.patch)
      const { shared, content: values } = splitContent("jobOpening", patch)
      const language = payload.language ?? DEFAULT_LANGUAGE
      // Also moves updated_at when only the content changes
      await tx
        .update(jobOpenings)
        .set({ ...shared, ...(posted_at ? { posted_at: toDate(posted_at) } : {}), updated_at: new Date() })
        .where(eq(jobOpenings.id, payload.id))
        .catch((error) => mapDbError(error, "job opening"))
      await saveContent(tx, "jobOpening", { job_opening_id: payload.id }, language, values, { replaceDraft: true })

      return loadTeamJobOpening(tx, payload.id, language)
    }
  )
}
