import { experience, teamMembers } from "@db/schema"
import { DEFAULT_LANGUAGE } from "@lumi/shared-contracts/language"
import { and, asc, desc, eq, ilike, or, sql } from "drizzle-orm"
import { z } from "zod"

import { requireTeam, type ServiceContext } from "./context"
import { concurrently, type Queryable } from "./db"
import { mapDbError, notFound } from "./errors"
import { mediaUrl } from "./media"
import { idempotencyKeyField, runMutation } from "./mutations"
import { containsPattern, listInputShape, pageSchema, pageWindow, type TeamListOptions } from "./pagination"
import {
  assertTranslatablePatch,
  definedFields,
  expectedVersionField,
  idSchema,
  iso,
  isoOrNull,
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
import { assertDateRange, assertStartedInPast, dateField, longTextField, nameField, toDate, toOptionalDate, uuidField } from "./rules"
import { contentSql, loadContentOf, missingTranslation, saveContent, splitContent, type ReadLanguage } from "./translations"
import { assertVersion, versionOf } from "./versions"

// Work experience: the employment history on a team member's profile (not their project contributions)

// Schemas

export const publicExperienceSchema = z.object({
  company: z.string(),
  position: z.string(),
  location: z.string(),
  start_date: timestampSchema,
  end_date: timestampSchema.nullable().describe("null while ongoing"),
  description: z.string().nullable(),
  logo_url: z.string().nullable(),
  ...localizedShape,
})

// An entry as a team member's profile nests it
export const teamExperienceEntrySchema = publicExperienceSchema.extend({
  id: idSchema,
  team_member_id: idSchema,
  is_ongoing: z.boolean(),
  version: versionSchema,
})

// An entry on its own, as the work experience list and writes return it
export const teamExperienceSchema = teamExperienceEntrySchema.extend({
  translations: translationStatusSchema,
})

export type TeamExperienceEntry = z.infer<typeof teamExperienceEntrySchema>
export type TeamExperience = z.infer<typeof teamExperienceSchema>

export const workExperiencePageSchema = pageSchema(teamExperienceSchema).extend({
  most_recent: z
    .object({
      experience_id: idSchema.nullable().describe("The most recent entry, or null when it is ambiguous or there are no entries"),
      ambiguous: z.boolean(),
      reason: z.string().nullable().describe("Why the most recent entry cannot be chosen automatically; ask the user which entry they mean"),
    })
    .describe("Most recent entry among all of the team member's entries, whatever the query"),
})

export const workExperienceListInput = z.object({
  team_member_id: uuidField("Team member id from admin_get_team_members"),
  ...listInputShape,
})

const experienceFields = {
  company: nameField("Company or organization"),
  position: nameField("Role or job title held"),
  location: nameField("City, country or Remote"),
  start_date: dateField("When the role started; must be in the past"),
  end_date: dateField("When the role ended; omit or null while it is ongoing"),
  description: longTextField("What the team member did (markdown)"),
}

export const addWorkExperienceInput = z.object({
  team_member_id: uuidField("Team member id from admin_get_team_members"),
  company: experienceFields.company,
  position: experienceFields.position,
  location: experienceFields.location,
  start_date: experienceFields.start_date,
  end_date: experienceFields.end_date.optional(),
  description: experienceFields.description.optional(),
  translation: translationInput({ position: experienceFields.position, description: experienceFields.description }),
  idempotency_key: idempotencyKeyField,
})

export const updateWorkExperienceInput = z.object({
  team_member_id: uuidField("Team member id the entry belongs to"),
  experience_id: uuidField("Entry id from admin_get_work_experiences"),
  expected_version: expectedVersionField,
  language: writeLanguageField,
  patch: patchSchema({
    company: experienceFields.company.optional(),
    position: requiredContentPatchField(experienceFields.position),
    location: experienceFields.location.optional(),
    start_date: experienceFields.start_date.optional(),
    end_date: experienceFields.end_date.nullable().optional(),
    description: experienceFields.description.nullable().optional(),
  }),
  idempotency_key: idempotencyKeyField,
})

// Queries

// An entry's content is read from its translations with experienceContent
type ExperienceRow = typeof experience.$inferSelect

const loadEntry = async (db: Queryable, id: string) => {
  const [entry] = await db.select().from(experience).where(eq(experience.id, id))
  return entry
}

// Most recent first: ongoing entries (latest start first), then completed ones by end date and start date
export const experienceOrder = [
  sql`${experience.end_date} is null desc`,
  sql`case when ${experience.end_date} is null then ${experience.start_date} end desc nulls last`,
  desc(experience.end_date),
  desc(experience.start_date),
  asc(experience.id),
]

// Translations of the entries, to read them in the language
const experienceContent = (db: Queryable, ids: string[], language?: ReadLanguage) => loadContentOf(db, "experience", ids, language)

type ExperienceContent = RecordContent<"experience">

// Covers the entry's content in every language, so saving any language changes it
const experienceVersion = (entry: ExperienceRow, content: ExperienceContent) =>
  versionOf({
    company: entry.company,
    location: entry.location,
    start_date: entry.start_date,
    end_date: entry.end_date,
    content: content.version({ experience_id: entry.id }),
  })

export function toPublicExperience(entry: ExperienceRow, content: ExperienceContent) {
  const localized = content.localize(entry, { experience_id: entry.id })

  return {
    company: entry.company,
    position: localized.position,
    location: entry.location,
    start_date: iso(entry.start_date),
    end_date: isoOrNull(entry.end_date),
    description: localized.description,
    logo_url: mediaUrl(entry.logo_key, { w: 120, h: 120 }),
    ...localizedAs(localized),
  }
}

export function toTeamExperienceEntry(entry: ExperienceRow, content: ExperienceContent): TeamExperienceEntry {
  return {
    ...toPublicExperience(entry, content),
    id: entry.id,
    team_member_id: entry.team_member_id!,
    is_ongoing: entry.end_date === null,
    version: experienceVersion(entry, content),
  }
}

function toTeamExperience(entry: ExperienceRow, content: ExperienceContent): TeamExperience {
  const key = { experience_id: entry.id }

  return {
    ...toTeamExperienceEntry(entry, content),
    translations: translationStatus(content.translations(key)),
  }
}

async function assertTeamMemberExists(db: Queryable, teamMemberId: string) {
  const [teamMember] = await db.select({ id: teamMembers.id }).from(teamMembers).where(eq(teamMembers.id, teamMemberId))
  if (!teamMember) throw notFound("team member", teamMemberId)
}

// The most recent entry is ambiguous when two entries are ongoing, or when the latest completed ones end and start together
async function mostRecent(db: Queryable, teamMemberId: string) {
  const [first, second] = await db
    .select({ id: experience.id, start_date: experience.start_date, end_date: experience.end_date })
    .from(experience)
    .where(eq(experience.team_member_id, teamMemberId))
    .orderBy(...experienceOrder)
    .limit(2)

  if (!first) return { experience_id: null, ambiguous: false, reason: "The team member has no work experience entries yet." }
  if (second && first.end_date === null && second.end_date === null) {
    return { experience_id: null, ambiguous: true, reason: "The team member has more than one ongoing entry." }
  }
  if (
    second &&
    first.end_date &&
    second.end_date?.getTime() === first.end_date.getTime() &&
    second.start_date.getTime() === first.start_date.getTime()
  ) {
    return { experience_id: null, ambiguous: true, reason: "The latest entries have the same dates." }
  }

  return { experience_id: first.id, ambiguous: false, reason: null }
}

// Team reads

export async function listWorkExperiences(
  ctx: ServiceContext,
  input: z.infer<typeof workExperienceListInput>,
  { language, missingLanguage }: TeamListOptions = {}
) {
  requireTeam(ctx, "read")
  await assertTeamMemberExists(ctx.db, input.team_member_id)

  const window = pageWindow(input, { team_member_id: input.team_member_id, query: input.query, language, missing_language: missingLanguage })
  const pattern = input.query ? containsPattern(input.query) : undefined
  const [rows, recent] = await concurrently(ctx.db, [
    () =>
      ctx.db
        .select()
        .from(experience)
        .where(
          and(
            eq(experience.team_member_id, input.team_member_id),
            pattern
              ? or(
                  ilike(experience.company, pattern),
                  ilike(contentSql("experience", "position", language), pattern),
                  ilike(experience.location, pattern),
                  ilike(contentSql("experience", "description", language), pattern)
                )
              : undefined,
            missingLanguage ? missingTranslation("experience", missingLanguage) : undefined
          )
        )
        .orderBy(...experienceOrder)
        .limit(window.fetch)
        .offset(window.offset),
    () => mostRecent(ctx.db, input.team_member_id),
  ])
  const content = await experienceContent(
    ctx.db,
    rows.map(({ id }) => id),
    language
  )

  return { ...window.toPage(rows.map((entry) => toTeamExperience(entry, content))), most_recent: recent }
}

// Team writes

export async function addWorkExperience(ctx: ServiceContext, { idempotency_key, ...payload }: z.infer<typeof addWorkExperienceInput>) {
  return runMutation(
    ctx,
    { operation: "add_work_experience", idempotencyKey: idempotency_key, payload, recordType: "experience", recordId: payload.team_member_id },
    async (tx) => {
      const start = toDate(payload.start_date)
      const end = toOptionalDate(payload.end_date)
      assertStartedInPast(start)
      assertDateRange(start, end)
      await assertTeamMemberExists(tx, payload.team_member_id)

      const [{ id }] = await tx
        .insert(experience)
        .values({ team_member_id: payload.team_member_id, company: payload.company, location: payload.location, start_date: start, end_date: end })
        .returning({ id: experience.id })
        .catch((error) => mapDbError(error, "experience"))
      await saveContent(tx, "experience", { experience_id: id }, DEFAULT_LANGUAGE, {
        position: payload.position,
        description: payload.description,
      })
      await saveTranslation(tx, "experience", { experience_id: id }, payload.translation)
      const entry = await loadEntry(tx, id)

      return toTeamExperience(entry, await experienceContent(tx, [entry.id]))
    }
  )
}

export async function updateWorkExperience(ctx: ServiceContext, { idempotency_key, ...payload }: z.infer<typeof updateWorkExperienceInput>) {
  return runMutation(
    ctx,
    { operation: "update_work_experience", idempotencyKey: idempotency_key, payload, recordType: "experience", recordId: payload.experience_id },
    async (tx) => {
      assertTranslatablePatch("experience", payload.language, payload.patch)
      // An entry of another team member answers not_found, so the pair is always checked together
      const [current] = await tx
        .select()
        .from(experience)
        .where(and(eq(experience.id, payload.experience_id), eq(experience.team_member_id, payload.team_member_id)))
        .for("update")
      if (!current) throw notFound("work experience entry for this team member", payload.experience_id)
      assertVersion(payload.expected_version, experienceVersion(current, await experienceContent(tx, [current.id])), "work experience entry")

      const { start_date, end_date, ...patch } = definedFields(payload.patch)
      const start = start_date ? toDate(start_date) : current.start_date
      const end = end_date === undefined ? current.end_date : toOptionalDate(end_date)
      if (start_date) assertStartedInPast(start)
      assertDateRange(start, end)

      const { shared, content } = splitContent("experience", patch)
      const language = payload.language ?? DEFAULT_LANGUAGE
      await tx
        .update(experience)
        .set({ ...shared, start_date: start, end_date: end })
        .where(eq(experience.id, payload.experience_id))
        .catch((error) => mapDbError(error, "experience"))
      await saveContent(tx, "experience", { experience_id: payload.experience_id }, language, content, { replaceDraft: true })
      const entry = await loadEntry(tx, payload.experience_id)

      return toTeamExperience(entry, await experienceContent(tx, [entry.id], language))
    }
  )
}
