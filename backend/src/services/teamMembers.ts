import {
  capabilities,
  clients,
  experience,
  projects,
  projectTeamMembers,
  projectTeamMemberTranslations,
  teamMemberCapabilities,
  teamMembers,
} from "@db/schema"
import { DEFAULT_LANGUAGE, type Language } from "@lumi/shared-contracts/language"
import { and, asc, count, desc, eq, getTableColumns, ilike, inArray, or, sql, type SQL } from "drizzle-orm"
import { z } from "zod"

import { assertCapabilitiesExist, capabilityName } from "./capabilities"
import { requireTeam, type ServiceContext } from "./context"
import { concurrently, type Queryable, type Tx } from "./db"
import { conflict, mapDbError, notFound } from "./errors"
import { experienceOrder, publicExperienceSchema, teamExperienceEntrySchema, toPublicExperience, toTeamExperienceEntry } from "./experiences"
import { mediaUrl, teamMemberPdfUrl } from "./media"
import { idempotencyKeyField, runMutation } from "./mutations"
import {
  containsPattern,
  listInputShape,
  nested,
  NESTED_LIMIT,
  nestedSchema,
  pageSchema,
  pageWindow,
  type DetailOptions,
  type ListOptions,
  type TeamListOptions,
} from "./pagination"
import {
  allowDuplicateNameField,
  assertNoSameName,
  assertSlugFree,
  assertTranslatablePatch,
  contributionEndDate,
  contributionFields,
  contributionVersion,
  definedFields,
  expectedVersionField,
  idSchema,
  iso,
  isoOrNull,
  localizedAs,
  localizedShape,
  patchSchema,
  requiredContentPatchField,
  sameNameCondition,
  saveTranslation,
  teamContributionFields,
  timestampSchema,
  translationInput,
  translationStatus,
  translationStatusSchema,
  versionSchema,
  writeLanguageField,
  type RecordContent,
} from "./records"
import { longTextField, MAX_LINKS_PER_CALL, nameField, slugField, starsField, urlField, uuidField } from "./rules"
import {
  contentSql,
  loadContent,
  loadContentOf,
  missingTranslation,
  missingTranslationOfText,
  requestedLanguage,
  saveContent,
  splitContent,
  type ReadLanguage,
} from "./translations"
import { assertVersion, versionOf } from "./versions"
import { isPublicClient, isPublicProject, isPublicTeamMember } from "./visibility"

// Schemas

export const publicTeamMemberSummarySchema = z.object({
  id: idSchema,
  name: z.string(),
  job_title: z.string(),
  url_slug: z.string(),
  capability_highlights: z.string().nullable(),
  profile_photo_url: z.string().nullable(),
  ...localizedShape,
})

export const publicTeamMemberSchema = publicTeamMemberSummarySchema.extend({
  bio: z.string().nullable(),
  education: z.string().nullable(),
  webpage: z.string().nullable().describe("Public resume page"),
  // The reads always return it; like the fields of knowledge sources that are off, the MCP tools and the chat leave it out
  // while the installation doesn't offer resumes (src/resume.ts)
  pdf_url: z
    .string()
    .optional()
    .describe(
      "Downloadable PDF resume in the requested language, falling back to English like the content. Only present while the installation offers resumes"
    ),
  experiences: nestedSchema(publicExperienceSchema).describe("Work experience, most recent first"),
  capabilities: nestedSchema(z.object({ id: idSchema, name: z.string(), stars: z.number().int(), ...localizedShape })).describe(
    "Capabilities, highest rated first"
  ),
  project_contributions: nestedSchema(
    z.object({
      project: z.object({
        id: idSchema,
        name: z.string(),
        client: z.object({ id: idSchema, name: z.string(), logo_url: z.string().nullable() }).nullable(),
        ...localizedShape,
      }),
      ...contributionFields,
      ...localizedShape,
    })
  ).describe("Contributions to public projects"),
})

const teamFlags = {
  published: z.boolean().describe("Approved for external disclosure; changed with publish_record and unpublish_record"),
  translations: translationStatusSchema,
  created_at: timestampSchema,
  updated_at: timestampSchema,
}

export const teamTeamMemberSummarySchema = publicTeamMemberSummarySchema.extend(teamFlags)

export const teamTeamMemberCapabilitySchema = z.object({
  id: idSchema,
  name: z.string(),
  stars: z.number().int(),
  ...localizedShape,
  version: versionSchema.describe("Capability rating version; pass it as expected_version to update_team_member_capability"),
})

export const teamTeamMemberSchema = publicTeamMemberSchema.extend({
  ...teamFlags,
  experiences: nestedSchema(teamExperienceEntrySchema).describe("Work experience entries, most recent first; see admin_get_work_experiences"),
  capabilities: nestedSchema(teamTeamMemberCapabilitySchema),
  project_contributions: nestedSchema(
    z.object({
      project: z.object({ id: idSchema, name: z.string(), published: z.boolean(), ...localizedShape }),
      ...teamContributionFields,
      ...localizedShape,
      translations: translationStatusSchema.describe("Languages the contribution's description is written in, English first"),
      version: versionSchema.describe("Contribution version; pass it as expected_version to update_project_contribution"),
    })
  ),
  version: versionSchema.describe("Team member version, covering the profile fields and capability ratings"),
})

export type PublicTeamMemberSummary = z.infer<typeof publicTeamMemberSummarySchema>
export type PublicTeamMember = z.infer<typeof publicTeamMemberSchema>
export type TeamTeamMember = z.infer<typeof teamTeamMemberSchema>

export const publicTeamMemberPageSchema = pageSchema(publicTeamMemberSummarySchema)
export const teamTeamMemberPageSchema = pageSchema(teamTeamMemberSummarySchema)

const listFilters = {
  ...listInputShape,
  capability_ids: z
    .array(uuidField("Capability id"))
    .min(1)
    .max(MAX_LINKS_PER_CALL)
    .optional()
    .describe("Capability ids from the capability read tools; team members having at least one of them match"),
  project_id: uuidField("Only team members who contributed to this project").optional(),
}

export const teamMemberListInput = z.object(listFilters)

const teamMemberFields = {
  name: nameField("Full name"),
  job_title: nameField("Job title, e.g. Senior Software Engineer"),
  url_slug: slugField,
  bio: longTextField("Profile summary (markdown). This is the field for a general profile summary"),
  education: longTextField("Education and qualifications (markdown)"),
  capability_highlights: longTextField("Short highlight of key capabilities (markdown)"),
  webpage: urlField("Public resume page"),
}

const capabilityRatingInput = z.object({ id: uuidField("Existing capability id from the capability read tools"), stars: starsField })

export const createTeamMemberInput = z.object({
  name: teamMemberFields.name,
  job_title: teamMemberFields.job_title,
  url_slug: teamMemberFields.url_slug,
  bio: teamMemberFields.bio.optional(),
  education: teamMemberFields.education.optional(),
  capability_highlights: teamMemberFields.capability_highlights.optional(),
  webpage: teamMemberFields.webpage.optional(),
  translation: translationInput({
    job_title: teamMemberFields.job_title,
    bio: teamMemberFields.bio,
    education: teamMemberFields.education,
    capability_highlights: teamMemberFields.capability_highlights,
  }),
  capabilities: z.array(capabilityRatingInput).max(MAX_LINKS_PER_CALL).optional().describe("Existing capabilities with their ratings"),
  allow_duplicate_name: allowDuplicateNameField,
  idempotency_key: idempotencyKeyField,
})

export const updateTeamMemberInput = z.object({
  id: uuidField("Team member id from admin_get_team_members"),
  expected_version: expectedVersionField,
  language: writeLanguageField,
  patch: patchSchema({
    name: teamMemberFields.name.optional(),
    job_title: requiredContentPatchField(teamMemberFields.job_title),
    url_slug: teamMemberFields.url_slug.optional(),
    bio: teamMemberFields.bio.nullable().optional(),
    education: teamMemberFields.education.nullable().optional(),
    capability_highlights: teamMemberFields.capability_highlights.nullable().optional(),
    webpage: teamMemberFields.webpage.nullable().optional(),
  }).describe("Profile fields to change. Use add_capabilities_to_team_member and update_team_member_capability for capabilities"),
  idempotency_key: idempotencyKeyField,
})

export const addCapabilitiesToTeamMemberInput = z.object({
  team_member_id: uuidField("Team member id from admin_get_team_members"),
  expected_version: expectedVersionField.describe("Team member version from your latest admin_get_team_member"),
  capabilities: z.array(capabilityRatingInput).min(1).max(MAX_LINKS_PER_CALL),
  idempotency_key: idempotencyKeyField,
})

export const updateTeamMemberCapabilityInput = z.object({
  team_member_id: uuidField("Team member id"),
  capability_id: uuidField("Capability id the team member already has"),
  expected_version: expectedVersionField.describe("Capability rating version from admin_get_team_member (capabilities.items[].version)"),
  stars: starsField,
  idempotency_key: idempotencyKeyField,
})

// Queries

// A team member's content is read from their translations with loadContent
type TeamMemberRow = typeof teamMembers.$inferSelect

const capabilityLinkVersion = (link: { stars: number }) => versionOf({ stars: link.stars })

// Covers the team member's content in every language, so saving any language changes it
function teamMemberVersion(teamMember: TeamMemberRow, capabilityLinks: { id: string; stars: number }[], content: string) {
  return versionOf({
    name: teamMember.name,
    url_slug: teamMember.url_slug,
    published: teamMember.published,
    webpage: teamMember.webpage,
    content,
    capabilities: capabilityLinks.map(({ id, stars }) => ({ id, stars })).sort((a, b) => (a.id < b.id ? -1 : 1)),
  })
}

type TeamMemberContent = RecordContent<"teamMember">

// Version of the team member's content in every language, as writes check it
const contentVersionOf = async (db: Queryable, teamMemberId: string) =>
  (await loadContentOf(db, "teamMember", [teamMemberId])).version({ team_member_id: teamMemberId })

const localizeTeamMember = (teamMember: TeamMemberRow, content: TeamMemberContent) => content.localize(teamMember, { team_member_id: teamMember.id })

// Content fields a team member summary returns; the profile returns them all
const summaryContent = ["job_title", "capability_highlights"]

function toPublicSummary(teamMember: ReturnType<typeof localizeTeamMember>, { detail = false } = {}): PublicTeamMemberSummary {
  return {
    id: teamMember.id,
    name: teamMember.name,
    job_title: teamMember.job_title,
    url_slug: teamMember.url_slug,
    capability_highlights: teamMember.capability_highlights,
    profile_photo_url: mediaUrl(teamMember.profile_photo_key, { w: 200, h: 200 }),
    ...localizedAs(teamMember, detail ? undefined : summaryContent),
  }
}

function toTeamSummary(teamMember: TeamMemberRow, content: TeamMemberContent, { detail = false } = {}) {
  return {
    ...toPublicSummary(localizeTeamMember(teamMember, content), { detail }),
    published: teamMember.published,
    translations: translationStatus(content.translations({ team_member_id: teamMember.id })),
    created_at: iso(teamMember.created_at),
    updated_at: iso(teamMember.updated_at),
  }
}

// Team members with content left to translate into the language, as the admin's team member list counts them: the team member
// has no translation in it, not even a draft, or one of their work experiences with English text has none
export function teamMemberMissingTranslation(language: Language): SQL {
  const entry = and(eq(experience.team_member_id, teamMembers.id), missingTranslationOfText("experience", language))
  return or(missingTranslation("teamMember", language), sql`exists (select 1 from ${experience} where ${entry})`)!
}

async function listTeamMembers(
  db: Queryable,
  input: z.infer<typeof teamMemberListInput>,
  onlyPublic: boolean,
  { language, missingLanguage }: TeamListOptions = {}
) {
  const filters = {
    query: input.query,
    capability_ids: input.capability_ids,
    project_id: input.project_id,
    language,
    missing_language: missingLanguage,
  }
  const window = pageWindow(input, filters)
  const pattern = input.query ? containsPattern(input.query) : undefined

  // A hidden project's id must not reveal who worked on it, so the public filter only matches public projects
  const projectFilter = input.project_id
    ? inArray(
        teamMembers.id,
        db
          .select({ id: projectTeamMembers.team_member_id })
          .from(projectTeamMembers)
          .innerJoin(projects, eq(projects.id, projectTeamMembers.project_id))
          .where(and(eq(projectTeamMembers.project_id, input.project_id), onlyPublic ? isPublicProject : undefined))
      )
    : undefined
  const capabilityFilter = input.capability_ids?.length
    ? inArray(
        teamMembers.id,
        db
          .select({ id: teamMemberCapabilities.team_member_id })
          .from(teamMemberCapabilities)
          .where(inArray(teamMemberCapabilities.capability_id, input.capability_ids))
      )
    : undefined

  // Matches the content in the language, or in English where it is not translated
  const rows = await db
    .select()
    .from(teamMembers)
    .where(
      and(
        onlyPublic ? isPublicTeamMember : undefined,
        pattern
          ? or(
              ilike(teamMembers.name, pattern),
              ilike(contentSql("teamMember", "job_title", language), pattern),
              ilike(contentSql("teamMember", "capability_highlights", language), pattern)
            )
          : undefined,
        projectFilter,
        capabilityFilter,
        missingLanguage ? teamMemberMissingTranslation(missingLanguage) : undefined
      )
    )
    .orderBy(asc(teamMembers.name), asc(teamMembers.id))
    .limit(window.fetch)
    .offset(window.offset)
  const content = await loadContentOf(
    db,
    "teamMember",
    rows.map(({ id }) => id),
    language
  )

  return { window, rows, content }
}

// Sorted by the capabilities' names in the language
async function capabilityLinks(db: Queryable, teamMemberId: string, language?: ReadLanguage) {
  return db
    .select({ id: capabilities.id, name: capabilityName, stars: teamMemberCapabilities.stars })
    .from(teamMemberCapabilities)
    .innerJoin(capabilities, eq(capabilities.id, teamMemberCapabilities.capability_id))
    .where(eq(teamMemberCapabilities.team_member_id, teamMemberId))
    .orderBy(desc(teamMemberCapabilities.stars), asc(contentSql("capability", "name", language)), asc(capabilities.id))
}

async function experiences(db: Queryable, teamMemberId: string, limit = NESTED_LIMIT, language?: ReadLanguage) {
  const where = eq(experience.team_member_id, teamMemberId)
  // The entries on the page, whose translations alone are loaded
  const pageIds = db
    .select({ id: experience.id })
    .from(experience)
    .where(where)
    .orderBy(...experienceOrder)
    .limit(limit)
  const [rows, [{ total }], content] = await concurrently(db, [
    () =>
      db
        .select()
        .from(experience)
        .where(where)
        .orderBy(...experienceOrder)
        .limit(limit),
    () => db.select({ total: count() }).from(experience).where(where),
    () => loadContentOf(db, "experience", pageIds, language),
  ])

  return { rows, total, content }
}

// Sorted by the projects' names in the language after their dates, ongoing first. With when each contribution ended, for the
// public reads; the team reads return the end date as written
async function contributions(db: Queryable, teamMemberId: string, onlyPublic: boolean, language?: ReadLanguage) {
  return db
    .select({
      link: getTableColumns(projectTeamMembers),
      ended: contributionEndDate,
      project: { id: projects.id, published: projects.published },
      client: { id: clients.id, name: clients.name, logo_key: clients.logo_key },
    })
    .from(projectTeamMembers)
    .innerJoin(projects, eq(projects.id, projectTeamMembers.project_id))
    .leftJoin(clients, and(eq(clients.id, projects.client_id), isPublicClient))
    .where(and(eq(projectTeamMembers.team_member_id, teamMemberId), onlyPublic ? isPublicProject : undefined))
    .orderBy(desc(contributionEndDate), desc(projectTeamMembers.start_date), asc(contentSql("project", "name", language)), asc(projects.id))
}

// Translations of a team member and of their capabilities and project contributions (with the projects), to read them in the language.
// Experiences load theirs with their rows
async function loadTeamMemberContent(db: Queryable, teamMemberId: string, language?: ReadLanguage) {
  const capabilityIds = db
    .select({ id: teamMemberCapabilities.capability_id })
    .from(teamMemberCapabilities)
    .where(eq(teamMemberCapabilities.team_member_id, teamMemberId))
  const projectIds = db
    .select({ id: projectTeamMembers.project_id })
    .from(projectTeamMembers)
    .where(eq(projectTeamMembers.team_member_id, teamMemberId))

  const [teamMember, capability, contribution, project] = await concurrently(db, [
    () => loadContentOf(db, "teamMember", [teamMemberId], language),
    () => loadContentOf(db, "capability", capabilityIds, language),
    () => loadContent(db, "projectTeamMember", eq(projectTeamMemberTranslations.team_member_id, teamMemberId), language),
    () => loadContentOf(db, "project", projectIds, language),
  ])

  return { teamMember, capability, contribution, project }
}

type TeamMemberRecordContent = Awaited<ReturnType<typeof loadTeamMemberContent>>

// The contribution's description and its project's name in the content's language, with the language each was returned in
// and whether it fell back to English
function localizeContribution(
  { link, project }: { link: typeof projectTeamMembers.$inferSelect; project: { id: string } },
  content: TeamMemberRecordContent
) {
  const contribution = content.contribution.localize(link, { team_member_id: link.team_member_id, project_id: link.project_id })
  const localizedProject = content.project.localize(project, { project_id: project.id })
  return {
    description: contribution.description,
    localized: localizedAs(contribution),
    name: localizedProject.name,
    projectLocalized: localizedAs(localizedProject, ["name"]),
  }
}

// A capability link with the capability's name in the content's language
function localizeCapabilityLink<T extends { id: string }>(link: T, content: TeamMemberRecordContent) {
  const localized = content.capability.localize(link, { capability_id: link.id })
  return { ...link, name: localized.name, ...localizedAs(localized, ["name"]) }
}

export async function loadTeamTeamMember(db: Queryable, id: string, language?: ReadLanguage): Promise<TeamTeamMember> {
  const [teamMember] = await db.select().from(teamMembers).where(eq(teamMembers.id, id))
  if (!teamMember) throw notFound("team member", id)

  const [links, experienceRows, contributionRows, content] = await concurrently(db, [
    () => capabilityLinks(db, id, language),
    () => experiences(db, id, NESTED_LIMIT, language),
    () => contributions(db, id, false, language),
    () => loadTeamMemberContent(db, id, language),
  ])
  const localized = localizeTeamMember(teamMember, content.teamMember)

  return {
    ...toTeamSummary(teamMember, content.teamMember, { detail: true }),
    bio: localized.bio,
    education: localized.education,
    webpage: teamMember.webpage,
    pdf_url: teamMemberPdfUrl(teamMember.id, requestedLanguage(language)),
    experiences: nested(
      experienceRows.rows.map((entry) => toTeamExperienceEntry(entry, experienceRows.content)),
      experienceRows.total
    ),
    capabilities: nested(links.map((link) => ({ ...localizeCapabilityLink(link, content), version: capabilityLinkVersion(link) }))),
    project_contributions: nested(
      contributionRows.map((row) => {
        const { link, project } = row
        const { description, localized, name, projectLocalized } = localizeContribution(row, content)
        const key = { team_member_id: link.team_member_id, project_id: link.project_id }
        return {
          project: { id: project.id, name, published: project.published, ...projectLocalized },
          description,
          ...localized,
          // update_project_contribution writes the description per language, and no list tool shows a contribution's languages
          translations: translationStatus(content.contribution.translations(key)),
          start_date: iso(link.start_date),
          end_date: isoOrNull(link.end_date),
          version: contributionVersion(link, content.contribution.version(key)),
        }
      })
    ),
    version: teamMemberVersion(teamMember, links, content.teamMember.version({ team_member_id: id })),
  }
}

// Public reads

export async function listPublicTeamMembers(ctx: ServiceContext, input: z.infer<typeof teamMemberListInput>, { language }: ListOptions = {}) {
  const { window, rows, content } = await listTeamMembers(ctx.db, input, true, { language })
  return window.toPage(rows.map((teamMember) => toPublicSummary(localizeTeamMember(teamMember, content))))
}

// Public projects of each team member, for Lumi's team member list
export async function publicProjectIdsByTeamMember(ctx: ServiceContext, teamMemberIds: string[]) {
  const byTeamMember = new Map<string, string[]>(teamMemberIds.map((id) => [id, []]))
  if (teamMemberIds.length === 0) return byTeamMember

  const rows = await ctx.db
    .select({ teamMemberId: projectTeamMembers.team_member_id, projectId: projectTeamMembers.project_id })
    .from(projectTeamMembers)
    .innerJoin(projects, eq(projects.id, projectTeamMembers.project_id))
    .where(and(inArray(projectTeamMembers.team_member_id, teamMemberIds), isPublicProject))
    .orderBy(desc(projectTeamMembers.start_date))

  rows.forEach(({ teamMemberId, projectId }) => byTeamMember.get(teamMemberId)?.push(projectId))
  return byTeamMember
}

// The photo key is returned for Lumi's chat card, which renders it through the media route; MCP returns only the record
export async function getPublicTeamMember(
  ctx: ServiceContext,
  id: string,
  { nestedLimit = NESTED_LIMIT, language }: DetailOptions = {}
): Promise<{ record: PublicTeamMember; media: { profilePhotoKey: string | null } }> {
  const [teamMember] = await ctx.db
    .select()
    .from(teamMembers)
    .where(and(eq(teamMembers.id, id), isPublicTeamMember))
  if (!teamMember) throw notFound("team member", id)

  const [links, experienceRows, contributionRows, content] = await concurrently(ctx.db, [
    () => capabilityLinks(ctx.db, id, language),
    () => experiences(ctx.db, id, nestedLimit, language),
    () => contributions(ctx.db, id, true, language),
    () => loadTeamMemberContent(ctx.db, id, language),
  ])
  const localized = localizeTeamMember(teamMember, content.teamMember)

  return {
    record: {
      ...toPublicSummary(localized, { detail: true }),
      bio: localized.bio,
      education: localized.education,
      webpage: teamMember.webpage,
      pdf_url: teamMemberPdfUrl(teamMember.id, requestedLanguage(language)),
      experiences: nested(
        experienceRows.rows.map((entry) => toPublicExperience(entry, experienceRows.content)),
        experienceRows.total,
        nestedLimit
      ),
      capabilities: nested(
        links.map((link) => {
          const { id, name, stars, language, fallback_fields } = localizeCapabilityLink(link, content)
          return { id, name, stars, language, fallback_fields }
        }),
        links.length,
        nestedLimit
      ),
      project_contributions: nested(
        contributionRows.map((row) => {
          const { link, ended, project, client } = row
          const { description, localized, name, projectLocalized } = localizeContribution(row, content)
          return {
            project: {
              id: project.id,
              name,
              client: client ? { id: client.id, name: client.name, logo_url: mediaUrl(client.logo_key, { w: 120, h: 120 }) } : null,
              ...projectLocalized,
            },
            description,
            ...localized,
            start_date: iso(link.start_date),
            end_date: isoOrNull(ended),
          }
        }),
        contributionRows.length,
        nestedLimit
      ),
    },
    media: { profilePhotoKey: teamMember.profile_photo_key },
  }
}

// Team reads

export async function listTeamTeamMembers(ctx: ServiceContext, input: z.infer<typeof teamMemberListInput>, options: TeamListOptions = {}) {
  requireTeam(ctx, "read")
  const { window, rows, content } = await listTeamMembers(ctx.db, input, false, options)
  return window.toPage(rows.map((teamMember) => toTeamSummary(teamMember, content)))
}

export async function getTeamTeamMember(ctx: ServiceContext, id: string, { language }: DetailOptions = {}) {
  requireTeam(ctx, "read")
  return loadTeamTeamMember(ctx.db, id, language)
}

// Team writes

async function lockTeamMember(tx: Tx, id: string) {
  const [teamMember] = await tx.select().from(teamMembers).where(eq(teamMembers.id, id)).for("update")
  if (!teamMember) throw notFound("team member", id)

  return teamMember
}

export async function createTeamMember(ctx: ServiceContext, { idempotency_key, ...payload }: z.infer<typeof createTeamMemberInput>) {
  return runMutation(ctx, { operation: "create_team_member", idempotencyKey: idempotency_key, payload, recordType: "team_member" }, async (tx) => {
    const sameName = await tx
      .select({ id: teamMembers.id, name: teamMembers.name })
      .from(teamMembers)
      .where(sameNameCondition(teamMembers.name, payload.name))
    assertNoSameName("team member", sameName, payload.allow_duplicate_name)
    await assertSlugFree(tx, "team member", teamMembers, teamMembers.name, payload.url_slug)
    await assertCapabilitiesExist(
      tx,
      (payload.capabilities ?? []).map(({ id }) => id),
      "capabilities"
    )

    const [{ id }] = await tx
      .insert(teamMembers)
      .values({ name: payload.name, url_slug: payload.url_slug, webpage: payload.webpage })
      .returning({ id: teamMembers.id })
      .catch((error) => mapDbError(error, "team member"))
    await saveContent(tx, "teamMember", { team_member_id: id }, DEFAULT_LANGUAGE, {
      job_title: payload.job_title,
      bio: payload.bio,
      education: payload.education,
      capability_highlights: payload.capability_highlights,
    })
    await saveTranslation(tx, "teamMember", { team_member_id: id }, payload.translation)

    if (payload.capabilities?.length) {
      await tx
        .insert(teamMemberCapabilities)
        .values(payload.capabilities.map((capability) => ({ team_member_id: id, capability_id: capability.id, stars: capability.stars })))
    }

    return loadTeamTeamMember(tx, id)
  })
}

export async function updateTeamMember(ctx: ServiceContext, { idempotency_key, ...payload }: z.infer<typeof updateTeamMemberInput>) {
  return runMutation(
    ctx,
    { operation: "update_team_member", idempotencyKey: idempotency_key, payload, recordType: "team_member", recordId: payload.id },
    async (tx) => {
      assertTranslatablePatch("teamMember", payload.language, payload.patch)
      const current = await lockTeamMember(tx, payload.id)
      assertVersion(
        payload.expected_version,
        teamMemberVersion(current, await capabilityLinks(tx, payload.id), await contentVersionOf(tx, payload.id)),
        "team member"
      )
      if (payload.patch.url_slug) await assertSlugFree(tx, "team member", teamMembers, teamMembers.name, payload.patch.url_slug, payload.id)

      const { shared, content } = splitContent("teamMember", definedFields(payload.patch))
      const language = payload.language ?? DEFAULT_LANGUAGE
      // Also moves updated_at when only the content changes
      await tx
        .update(teamMembers)
        .set({ ...shared, updated_at: new Date() })
        .where(eq(teamMembers.id, payload.id))
        .catch((error) => mapDbError(error, "team member"))
      await saveContent(tx, "teamMember", { team_member_id: payload.id }, language, content, { replaceDraft: true })

      return loadTeamTeamMember(tx, payload.id, language)
    }
  )
}

export const addTeamMemberCapabilitiesResultSchema = z.object({
  id: idSchema.describe("Team member id"),
  team_member: teamTeamMemberSchema,
  added_capability_ids: z.array(idSchema),
  already_linked_capability_ids: z.array(idSchema).describe("Capabilities the team member already had with the same rating, left unchanged"),
})

export async function addCapabilitiesToTeamMember(
  ctx: ServiceContext,
  { idempotency_key, ...payload }: z.infer<typeof addCapabilitiesToTeamMemberInput>
) {
  return runMutation(
    ctx,
    {
      operation: "add_capabilities_to_team_member",
      idempotencyKey: idempotency_key,
      payload,
      recordType: "team_member",
      recordId: payload.team_member_id,
    },
    async (tx) => {
      const teamMember = await lockTeamMember(tx, payload.team_member_id)
      const links = await capabilityLinks(tx, payload.team_member_id)
      assertVersion(payload.expected_version, teamMemberVersion(teamMember, links, await contentVersionOf(tx, payload.team_member_id)), "team member")
      await assertCapabilitiesExist(
        tx,
        payload.capabilities.map(({ id }) => id),
        "capabilities"
      )

      const current = new Map(links.map((link) => [link.id, link]))
      const differentRatings = payload.capabilities.filter(
        (capability) => current.has(capability.id) && current.get(capability.id)!.stars !== capability.stars
      )
      if (differentRatings.length) {
        throw conflict(
          "The team member already has some of these capabilities with another rating. Nothing was added; use update_team_member_capability to change a rating.",
          {
            current_ratings: differentRatings.map(({ id }) => {
              const link = current.get(id)!
              return { id, name: link.name, stars: link.stars, version: capabilityLinkVersion(link) }
            }),
          }
        )
      }

      const added = payload.capabilities.filter((capability) => !current.has(capability.id))
      if (added.length) {
        await tx
          .insert(teamMemberCapabilities)
          .values(added.map((capability) => ({ team_member_id: payload.team_member_id, capability_id: capability.id, stars: capability.stars })))
      }

      return {
        id: payload.team_member_id,
        team_member: await loadTeamTeamMember(tx, payload.team_member_id),
        added_capability_ids: added.map(({ id }) => id),
        already_linked_capability_ids: payload.capabilities.filter((capability) => current.has(capability.id)).map(({ id }) => id),
      }
    }
  )
}

export async function updateTeamMemberCapability(
  ctx: ServiceContext,
  { idempotency_key, ...payload }: z.infer<typeof updateTeamMemberCapabilityInput>
) {
  return runMutation(
    ctx,
    {
      operation: "update_team_member_capability",
      idempotencyKey: idempotency_key,
      payload,
      recordType: "team_member",
      recordId: payload.team_member_id,
    },
    async (tx) => {
      await lockTeamMember(tx, payload.team_member_id)
      const linkFilter = and(
        eq(teamMemberCapabilities.team_member_id, payload.team_member_id),
        eq(teamMemberCapabilities.capability_id, payload.capability_id)
      )
      const [link] = await tx.select().from(teamMemberCapabilities).where(linkFilter).for("update")
      if (!link) {
        throw notFound("capability rating for this team member (add it with add_capabilities_to_team_member)", payload.capability_id)
      }
      assertVersion(payload.expected_version, capabilityLinkVersion(link), "capability rating")

      await tx.update(teamMemberCapabilities).set({ stars: payload.stars }).where(linkFilter)

      return loadTeamTeamMember(tx, payload.team_member_id)
    }
  )
}
