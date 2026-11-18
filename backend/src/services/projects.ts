import { capabilities, clients, projectCapabilities, projects, projectTeamMembers, projectTeamMemberTranslations, teamMembers } from "@db/schema"
import { DEFAULT_LANGUAGE, type Language } from "@lumi/shared-contracts/language"
import { and, asc, desc, eq, ilike, inArray, or, sql, type SQL } from "drizzle-orm"
import { z } from "zod"

import { assertCapabilitiesExist, capabilityName } from "./capabilities"
import { requireTeam, type ServiceContext } from "./context"
import { concurrently, type Queryable, type Tx } from "./db"
import { conflict, mapDbError, notFound } from "./errors"
import { mediaUrl } from "./media"
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
  assertExists,
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
import {
  assertDateRange,
  assertUnique,
  dateField,
  locationField,
  longTextField,
  MAX_ARTICLE_URL_LENGTH,
  MAX_LINKS_PER_CALL,
  nameField,
  shortTextField,
  slugField,
  toDate,
  toOptionalDate,
  urlField,
  uuidField,
} from "./rules"
import {
  contentSql,
  loadContent,
  loadContentOf,
  missingTranslation,
  missingTranslationOfText,
  saveContent,
  splitContent,
  type ReadLanguage,
} from "./translations"
import { assertVersion, versionOf } from "./versions"
import { isPublicClient, isPublicProject, isPublicTeamMember } from "./visibility"

// Schemas

const clientRefSchema = z.object({ id: idSchema, name: z.string() })
const capabilityRefSchema = z.object({ id: idSchema, name: z.string(), ...localizedShape })

export const publicProjectSummarySchema = z.object({
  id: idSchema,
  name: z.string(),
  url_slug: z.string(),
  summary: z.string().nullable(),
  location: z.enum(["REMOTE", "HYBRID", "ONSITE"]),
  industry: z.string().nullable(),
  type: z.string().nullable(),
  start_date: timestampSchema,
  end_date: timestampSchema.nullable().describe("null while the project is ongoing"),
  client: clientRefSchema.nullable().describe("Public client, or null when the client is undisclosed"),
  ...localizedShape,
})

export const publicProjectSchema = publicProjectSummarySchema.extend({
  description: z.string().nullable(),
  webpage: z.string().nullable().describe("Public case-study page"),
  image_url: z.string().nullable(),
  client: clientRefSchema.extend({ summary: z.string(), logo_url: z.string().nullable(), ...localizedShape }).nullable(),
  capabilities: nestedSchema(capabilityRefSchema),
  team_members: nestedSchema(
    z.object({
      team_member: z.object({
        id: idSchema,
        name: z.string(),
        job_title: z.string(),
        profile_photo_url: z.string().nullable(),
        ...localizedShape,
      }),
      ...contributionFields,
      ...localizedShape,
    })
  ).describe("Public team members who worked on the project"),
})

const teamClientRefSchema = clientRefSchema.extend({ published: z.boolean() })

export const teamProjectSummarySchema = publicProjectSummarySchema.extend({
  client: teamClientRefSchema.nullable(),
  published: z.boolean().describe("Approved for external disclosure; changed with publish_record and unpublish_record"),
  translations: translationStatusSchema,
  created_at: timestampSchema,
  updated_at: timestampSchema,
})

export const teamContributionSchema = z.object({
  team_member: z.object({ id: idSchema, name: z.string(), job_title: z.string(), published: z.boolean(), ...localizedShape }),
  ...teamContributionFields,
  ...localizedShape,
  translations: translationStatusSchema.describe("Languages the contribution's description is written in, English first"),
  version: versionSchema.describe("Contribution version; pass it as expected_version to update_project_contribution"),
})

export const teamProjectSchema = teamProjectSummarySchema.extend({
  description: z.string().nullable(),
  webpage: z.string().nullable(),
  image_url: z.string().nullable(),
  capabilities: nestedSchema(capabilityRefSchema),
  team_members: nestedSchema(teamContributionSchema),
  version: versionSchema.describe("Project version, covering its fields, capabilities and team member contributions"),
})

export type PublicProjectSummary = z.infer<typeof publicProjectSummarySchema>
export type PublicProject = z.infer<typeof publicProjectSchema>
export type TeamProject = z.infer<typeof teamProjectSchema>

export const publicProjectPageSchema = pageSchema(publicProjectSummarySchema)
export const teamProjectPageSchema = pageSchema(teamProjectSummarySchema)

const capabilityIdsField = z
  .array(uuidField("Capability id"))
  .min(1)
  .max(MAX_LINKS_PER_CALL)
  .describe("Capability ids from the capability read tools; projects having at least one of them match")

export const projectListInput = z.object({
  ...listInputShape,
  client_id: uuidField("Only projects for this client (customer)").optional(),
  capability_ids: capabilityIdsField.optional(),
})

const projectFields = {
  name: nameField("Project name"),
  url_slug: slugField,
  start_date: dateField("When the project started"),
  end_date: dateField("When the project ended; omit or null while it is ongoing. Contributions without an end date end with the project"),
  location: locationField,
  summary: longTextField("One or two sentences about the project"),
  description: longTextField("Full project description (markdown)"),
  webpage: urlField("Public case-study or project page"),
  industry: shortTextField(50, "Industry, e.g. Energy"),
  type: shortTextField(50, "Kind of project, e.g. IoT platform"),
  client_id: uuidField("Existing client (customer) id from admin_get_clients"),
}

const contributionDescription = longTextField("What the team member did on the project")

const contributionInput = z.object({
  team_member_id: uuidField("Existing team member id from admin_get_team_members"),
  start_date: dateField("When the team member started on the project (not assumed from the project dates)"),
  end_date: dateField("When the team member's involvement ended; omit to end with the project, or while both are ongoing").optional(),
  description: contributionDescription.optional(),
  translation: translationInput({ description: contributionDescription }),
})

export const createProjectInput = z.object({
  name: projectFields.name,
  url_slug: projectFields.url_slug,
  start_date: projectFields.start_date,
  end_date: projectFields.end_date.optional(),
  location: projectFields.location,
  summary: projectFields.summary.optional(),
  description: projectFields.description.optional(),
  webpage: projectFields.webpage.optional(),
  industry: projectFields.industry.optional(),
  type: projectFields.type.optional(),
  client_id: projectFields.client_id.optional(),
  translation: translationInput({
    name: projectFields.name,
    summary: projectFields.summary,
    description: projectFields.description,
    industry: projectFields.industry,
    type: projectFields.type,
  }),
  capability_ids: z.array(uuidField("Capability id")).max(MAX_LINKS_PER_CALL).optional().describe("Existing capabilities to link to the new project"),
  team_members: z.array(contributionInput).max(MAX_LINKS_PER_CALL).optional().describe("Existing team members who worked on the project"),
  source_url: urlField(
    "Article the draft came from (prepare_project_from_url), kept as provenance in the audit trail",
    MAX_ARTICLE_URL_LENGTH
  ).optional(),
  allow_duplicate_name: allowDuplicateNameField,
  idempotency_key: idempotencyKeyField,
})

// The fields an update_project patch can change, which the MCP server's tool leaves the client out of while clients are off
export const projectPatchFields = {
  name: requiredContentPatchField(projectFields.name),
  url_slug: projectFields.url_slug.optional(),
  start_date: projectFields.start_date.optional(),
  end_date: projectFields.end_date.nullable().optional(),
  location: projectFields.location.optional(),
  summary: projectFields.summary.nullable().optional(),
  description: projectFields.description.nullable().optional(),
  webpage: projectFields.webpage.nullable().optional(),
  industry: projectFields.industry.nullable().optional(),
  type: projectFields.type.nullable().optional(),
  client_id: projectFields.client_id.nullable().optional().describe("Existing client id, or null to remove the client"),
}

export const updateProjectInput = z.object({
  id: uuidField("Project id from admin_get_projects"),
  expected_version: expectedVersionField,
  language: writeLanguageField,
  patch: patchSchema(projectPatchFields).describe(
    "Fields to change. Use add_team_member_to_project, update_project_contribution and add_capabilities_to_project for relationships"
  ),
  idempotency_key: idempotencyKeyField,
})

export const addTeamMemberToProjectInput = z.object({
  project_id: uuidField("Project id from admin_get_projects"),
  expected_version: expectedVersionField.describe("Project version from your latest admin_get_project"),
  ...contributionInput.shape,
  idempotency_key: idempotencyKeyField,
})

export const updateProjectContributionInput = z.object({
  project_id: uuidField("Project id"),
  team_member_id: uuidField("Team member id"),
  expected_version: expectedVersionField.describe("Contribution version from admin_get_project (team_members.items[].version)"),
  language: writeLanguageField,
  patch: patchSchema({
    description: longTextField("What the team member did").nullable().optional(),
    start_date: dateField("When the team member started on the project").optional(),
    end_date: dateField("When the team member's involvement ended; null to end with the project, or while both are ongoing").nullable().optional(),
  }),
  idempotency_key: idempotencyKeyField,
})

export const addCapabilitiesToProjectInput = z.object({
  project_id: uuidField("Project id from admin_get_projects"),
  expected_version: expectedVersionField.describe("Project version from your latest admin_get_project"),
  capability_ids: z
    .array(uuidField("Capability id"))
    .min(1)
    .max(MAX_LINKS_PER_CALL)
    .describe("Existing capabilities to add; capabilities already linked are left as they are"),
  idempotency_key: idempotencyKeyField,
})

// Queries

// A project's and a contribution's content are read from their translations with loadContent
type ProjectRow = typeof projects.$inferSelect

type ContributionRow = typeof projectTeamMembers.$inferSelect

// The project's English name, for sorting and same-name checks
const projectName = contentSql("project", "name")

// The contribution's description in every language, which its version covers, to read it in the language
const contributionContent = (db: Queryable, projectId: string, teamMemberId: string, language?: ReadLanguage) =>
  loadContent(
    db,
    "projectTeamMember",
    and(eq(projectTeamMemberTranslations.project_id, projectId), eq(projectTeamMemberTranslations.team_member_id, teamMemberId)),
    language
  )

const linkVersion = (link: ContributionRow, content: RecordContent<"projectTeamMember">) =>
  contributionVersion(link, content.version({ team_member_id: link.team_member_id, project_id: link.project_id }))

// Projects with content left to translate into the language, as the admin's project list counts them: the project has no
// translation in it, not even a draft, or one of its contributions with English text has none
export function projectMissingTranslation(language: Language): SQL {
  const contribution = and(eq(projectTeamMembers.project_id, projects.id), missingTranslationOfText("projectTeamMember", language))
  return or(missingTranslation("project", language), sql`exists (select 1 from ${projectTeamMembers} where ${contribution})`)!
}

// Matches the content in the language, or in English where it is not translated
function searchCondition(query: string | undefined, language?: ReadLanguage) {
  if (!query) return undefined
  const pattern = containsPattern(query)
  return or(...(["name", "summary", "industry", "type"] as const).map((field) => ilike(contentSql("project", field, language), pattern)))
}

type ProjectContent = RecordContent<"project">

// Content fields a project summary returns; the details return them all
const summaryContent = ["name", "summary", "industry", "type"]

function summaryFields(project: ReturnType<typeof localizeProject>, { detail = false } = {}) {
  return {
    id: project.id,
    name: project.name,
    url_slug: project.url_slug,
    summary: project.summary,
    location: project.location,
    industry: project.industry,
    type: project.type,
    start_date: iso(project.start_date),
    end_date: isoOrNull(project.end_date),
    ...localizedAs(project, detail ? undefined : summaryContent),
  }
}

const localizeProject = (project: ProjectRow, content: ProjectContent) => content.localize(project, { project_id: project.id })

async function listProjects(
  db: Queryable,
  input: z.infer<typeof projectListInput>,
  onlyPublic: boolean,
  { language, missingLanguage }: TeamListOptions = {}
) {
  const filters = {
    query: input.query,
    client_id: input.client_id,
    capability_ids: input.capability_ids,
    language,
    missing_language: missingLanguage,
  }
  const window = pageWindow(input, filters)

  // A hidden client's id must not reveal which public projects it has, so the public filter only matches public clients
  const clientFilter = input.client_id
    ? onlyPublic
      ? and(eq(projects.client_id, input.client_id), inArray(projects.client_id, db.select({ id: clients.id }).from(clients).where(isPublicClient)))
      : eq(projects.client_id, input.client_id)
    : undefined
  const capabilityFilter = input.capability_ids?.length
    ? inArray(
        projects.id,
        db
          .select({ id: projectCapabilities.project_id })
          .from(projectCapabilities)
          .where(inArray(projectCapabilities.capability_id, input.capability_ids))
      )
    : undefined

  const rows = await db
    .select({ project: projects, client: { id: clients.id, name: clients.name, published: clients.published } })
    .from(projects)
    .leftJoin(clients, eq(clients.id, projects.client_id))
    .where(
      and(
        onlyPublic ? isPublicProject : undefined,
        searchCondition(input.query, language),
        clientFilter,
        capabilityFilter,
        missingLanguage ? projectMissingTranslation(missingLanguage) : undefined
      )
    )
    .orderBy(desc(projects.start_date), asc(contentSql("project", "name", language)), asc(projects.id))
    .limit(window.fetch)
    .offset(window.offset)
  const content = await loadContentOf(
    db,
    "project",
    rows.map(({ project }) => project.id),
    language
  )

  return { window, rows, content }
}

// Sorted by the capabilities' names in the language
async function projectCapabilityRows(db: Queryable, projectId: string, language?: ReadLanguage) {
  return db
    .select({ id: capabilities.id, name: capabilityName })
    .from(projectCapabilities)
    .innerJoin(capabilities, eq(capabilities.id, projectCapabilities.capability_id))
    .where(eq(projectCapabilities.project_id, projectId))
    .orderBy(asc(contentSql("capability", "name", language)), asc(capabilities.id))
}

// With when each contribution ended, for the public reads; the team reads return the end date as written
async function projectContributionRows(db: Queryable, projectId: string, onlyPublic: boolean) {
  return db
    .select({ link: projectTeamMembers, teamMember: teamMembers, ended: contributionEndDate })
    .from(projectTeamMembers)
    .innerJoin(teamMembers, eq(teamMembers.id, projectTeamMembers.team_member_id))
    .innerJoin(projects, eq(projects.id, projectTeamMembers.project_id))
    .where(and(eq(projectTeamMembers.project_id, projectId), onlyPublic ? isPublicTeamMember : undefined))
    .orderBy(asc(projectTeamMembers.start_date), asc(teamMembers.name), asc(teamMembers.id))
}

// Translations of a project and of its capabilities and contributions (with their team members), to read them in the language
async function loadProjectContent(db: Queryable, projectId: string, language?: ReadLanguage) {
  const capabilityIds = db
    .select({ id: projectCapabilities.capability_id })
    .from(projectCapabilities)
    .where(eq(projectCapabilities.project_id, projectId))
  const teamMemberIds = db
    .select({ id: projectTeamMembers.team_member_id })
    .from(projectTeamMembers)
    .where(eq(projectTeamMembers.project_id, projectId))

  const [project, capability, contribution, teamMember] = await concurrently(db, [
    () => loadContentOf(db, "project", [projectId], language),
    () => loadContentOf(db, "capability", capabilityIds, language),
    () => loadContent(db, "projectTeamMember", eq(projectTeamMemberTranslations.project_id, projectId), language),
    () => loadContentOf(db, "teamMember", teamMemberIds, language),
  ])

  return { project, capability, contribution, teamMember }
}

type ContributionContent = Pick<Awaited<ReturnType<typeof loadProjectContent>>, "contribution" | "teamMember">

function localizeCapabilities(capabilityRows: { id: string; name: string }[], content: RecordContent<"capability">) {
  return capabilityRows.map((capability) => {
    const localized = content.localize(capability, { capability_id: capability.id })
    return { id: capability.id, name: localized.name, ...localizedAs(localized, ["name"]) }
  })
}

// The contribution's description and its team member's job title in the content's language, with the language each was
// returned in and whether it fell back to English
function localizeContribution(
  { link, teamMember }: { link: typeof projectTeamMembers.$inferSelect; teamMember: typeof teamMembers.$inferSelect },
  content: ContributionContent
) {
  const contribution = content.contribution.localize(link, { team_member_id: link.team_member_id, project_id: link.project_id })
  const profile = content.teamMember.localize(teamMember, { team_member_id: teamMember.id })
  return {
    description: contribution.description,
    localized: localizedAs(contribution),
    job_title: profile.job_title,
    teamMemberLocalized: localizedAs(profile, ["job_title"]),
  }
}

// Version of a project with its relationships: adding a capability or contribution, or editing one, changes it. It covers the
// content of the project and its contributions in every language, so saving any language changes it
function projectVersion(
  project: ProjectRow,
  capabilityIds: string[],
  contributions: { link: ContributionRow }[],
  content: { project: ProjectContent; contribution: RecordContent<"projectTeamMember"> }
) {
  return versionOf({
    url_slug: project.url_slug,
    start_date: project.start_date,
    end_date: project.end_date,
    location: project.location,
    webpage: project.webpage,
    client_id: project.client_id,
    published: project.published,
    content: content.project.version({ project_id: project.id }),
    capability_ids: [...capabilityIds].sort(),
    team_members: contributions
      .map(({ link }) => ({ id: link.team_member_id, version: linkVersion(link, content.contribution) }))
      .sort((a, b) => (a.id < b.id ? -1 : 1)),
  })
}

export async function loadTeamProject(db: Queryable, id: string, language?: ReadLanguage): Promise<TeamProject> {
  const [row] = await db
    .select({ project: projects, client: { id: clients.id, name: clients.name, published: clients.published } })
    .from(projects)
    .leftJoin(clients, eq(clients.id, projects.client_id))
    .where(eq(projects.id, id))
  if (!row) throw notFound("project", id)

  const [capabilityRows, contributions, content] = await concurrently(db, [
    () => projectCapabilityRows(db, id, language),
    () => projectContributionRows(db, id, false),
    () => loadProjectContent(db, id, language),
  ])
  const { project } = row
  const localized = localizeProject(project, content.project)

  return {
    ...summaryFields(localized, { detail: true }),
    client: row.client,
    published: project.published,
    translations: translationStatus(content.project.translations({ project_id: id })),
    created_at: iso(project.created_at),
    updated_at: iso(project.updated_at),
    description: localized.description,
    webpage: project.webpage,
    image_url: mediaUrl(project.image_key, { w: 1000 }),
    capabilities: nested(localizeCapabilities(capabilityRows, content.capability)),
    team_members: nested(contributions.map((contribution) => toTeamContribution(contribution, content))),
    version: projectVersion(
      project,
      capabilityRows.map(({ id }) => id),
      contributions,
      content
    ),
  }
}

function toTeamContribution(row: { link: ContributionRow; teamMember: typeof teamMembers.$inferSelect }, content: ContributionContent) {
  const { link, teamMember } = row
  const { description, localized, job_title, teamMemberLocalized } = localizeContribution(row, content)
  const key = { team_member_id: link.team_member_id, project_id: link.project_id }

  return {
    team_member: {
      id: teamMember.id,
      name: teamMember.name,
      job_title,
      published: teamMember.published,
      ...teamMemberLocalized,
    },
    description,
    ...localized,
    // update_project_contribution writes the description per language, and no list tool shows a contribution's languages
    translations: translationStatus(content.contribution.translations(key)),
    start_date: iso(link.start_date),
    end_date: isoOrNull(link.end_date),
    version: linkVersion(link, content.contribution),
  }
}

// Public reads

export async function listPublicProjects(ctx: ServiceContext, input: z.infer<typeof projectListInput>, { language }: ListOptions = {}) {
  const { window, rows, content } = await listProjects(ctx.db, input, true, { language })

  return window.toPage<PublicProjectSummary>(
    rows.map(({ project, client }) => ({
      ...summaryFields(localizeProject(project, content)),
      client: client?.published ? { id: client.id, name: client.name } : null,
    }))
  )
}

// The image and logo keys are returned for Lumi's chat card, which renders them through the media route; MCP returns only the record
export async function getPublicProject(
  ctx: ServiceContext,
  id: string,
  { nestedLimit = NESTED_LIMIT, language }: DetailOptions = {}
): Promise<{ record: PublicProject; media: { imageKey: string | null; clientLogoKey: string | null } }> {
  const [row] = await ctx.db
    .select({ project: projects, client: clients })
    .from(projects)
    .leftJoin(clients, and(eq(clients.id, projects.client_id), isPublicClient))
    .where(and(eq(projects.id, id), isPublicProject))
  if (!row) throw notFound("project", id)

  const { project, client } = row
  const [capabilityRows, contributions, content, clientContent] = await concurrently(ctx.db, [
    () => projectCapabilityRows(ctx.db, id, language),
    () => projectContributionRows(ctx.db, id, true),
    () => loadProjectContent(ctx.db, id, language),
    () => loadContentOf(ctx.db, "client", client ? [client.id] : [], language),
  ])
  const localized = localizeProject(project, content.project)
  const localizedClient = client ? clientContent.localize(client, { client_id: client.id }) : null

  return {
    record: {
      ...summaryFields(localized, { detail: true }),
      description: localized.description,
      webpage: project.webpage,
      image_url: mediaUrl(project.image_key, { w: 1000 }),
      client: localizedClient
        ? {
            id: localizedClient.id,
            name: localizedClient.name,
            summary: localizedClient.summary,
            logo_url: mediaUrl(localizedClient.logo_key, { w: 120, h: 120 }),
            ...localizedAs(localizedClient, ["summary"]),
          }
        : null,
      capabilities: nested(localizeCapabilities(capabilityRows, content.capability), capabilityRows.length, nestedLimit),
      team_members: nested(
        contributions.map((contribution) => {
          const { link, teamMember, ended } = contribution
          const { description, localized, job_title, teamMemberLocalized } = localizeContribution(contribution, content)
          return {
            team_member: {
              id: teamMember.id,
              name: teamMember.name,
              job_title,
              profile_photo_url: mediaUrl(teamMember.profile_photo_key, { w: 200, h: 200 }),
              ...teamMemberLocalized,
            },
            description,
            ...localized,
            start_date: iso(link.start_date),
            end_date: isoOrNull(ended),
          }
        }),
        contributions.length,
        nestedLimit
      ),
    },
    media: { imageKey: project.image_key, clientLogoKey: client?.logo_key ?? null },
  }
}

// Team reads

export async function listTeamProjects(ctx: ServiceContext, input: z.infer<typeof projectListInput>, options: TeamListOptions = {}) {
  requireTeam(ctx, "read")
  const { window, rows, content } = await listProjects(ctx.db, input, false, options)

  return window.toPage(
    rows.map(({ project, client }) => ({
      ...summaryFields(localizeProject(project, content)),
      client,
      published: project.published,
      translations: translationStatus(content.translations({ project_id: project.id })),
      created_at: iso(project.created_at),
      updated_at: iso(project.updated_at),
    }))
  )
}

export async function getTeamProject(ctx: ServiceContext, id: string, { language }: DetailOptions = {}) {
  requireTeam(ctx, "read")
  return loadTeamProject(ctx.db, id, language)
}

// The project using a url_slug, if any
export async function findProjectBySlug(ctx: ServiceContext, slug: string) {
  requireTeam(ctx, "read")
  const [project] = await ctx.db.select({ id: projects.id, name: projectName }).from(projects).where(eq(projects.url_slug, slug))
  return project
}

// Team writes

async function lockProject(tx: Tx, id: string) {
  const [project] = await tx.select().from(projects).where(eq(projects.id, id)).for("update")
  if (!project) throw notFound("project", id)

  return project
}

async function currentProjectVersion(tx: Tx, project: ProjectRow) {
  const [capabilityRows, contributions, projectContent, contribution] = await concurrently(tx, [
    () => projectCapabilityRows(tx, project.id),
    () => projectContributionRows(tx, project.id, false),
    () => loadContentOf(tx, "project", [project.id]),
    () => loadContent(tx, "projectTeamMember", eq(projectTeamMemberTranslations.project_id, project.id)),
  ])
  return projectVersion(
    project,
    capabilityRows.map(({ id }) => id),
    contributions,
    { project: projectContent, contribution }
  )
}

async function assertClientExists(db: Queryable, clientId: string) {
  assertExists("client", [clientId], await db.select({ id: clients.id }).from(clients).where(eq(clients.id, clientId)))
}

async function assertTeamMembersExist(db: Queryable, teamMemberIds: string[]) {
  assertUnique(teamMemberIds, "team member ids")
  if (teamMemberIds.length) {
    assertExists(
      "team member",
      teamMemberIds,
      await db.select({ id: teamMembers.id }).from(teamMembers).where(inArray(teamMembers.id, teamMemberIds))
    )
  }
}

// Adds team members to a project, with their contributions' descriptions in English and in the translation given
async function insertContributions(tx: Tx, projectId: string, contributions: z.infer<typeof contributionInput>[]) {
  const links = contributions.map((contribution) => {
    const start = toDate(contribution.start_date)
    const end = toOptionalDate(contribution.end_date)
    assertDateRange(start, end, "team member end_date")

    return { project_id: projectId, team_member_id: contribution.team_member_id, start_date: start, end_date: end }
  })
  if (links.length === 0) return

  await tx.insert(projectTeamMembers).values(links)
  for (const { team_member_id, description, translation } of contributions) {
    const key = { team_member_id, project_id: projectId }
    await saveContent(tx, "projectTeamMember", key, DEFAULT_LANGUAGE, { description })
    await saveTranslation(tx, "projectTeamMember", key, translation)
  }
}

export async function createProject(ctx: ServiceContext, { idempotency_key, source_url, ...payload }: z.infer<typeof createProjectInput>) {
  return runMutation(
    ctx,
    {
      operation: "create_project",
      idempotencyKey: idempotency_key,
      payload: { ...payload, source_url },
      recordType: "project",
      auditDetails: source_url ? { source_url } : undefined,
    },
    async (tx) => {
      const start = toDate(payload.start_date)
      const end = toOptionalDate(payload.end_date)
      assertDateRange(start, end)

      // The translation's name is checked against the names in its language too, falling back to English
      const { translation } = payload
      const sameName = await tx
        .select({ id: projects.id, name: projectName })
        .from(projects)
        .where(
          or(
            sameNameCondition(projectName, payload.name),
            translation?.name ? sameNameCondition(contentSql("project", "name", translation.language), translation.name) : undefined
          )
        )
      assertNoSameName("project", sameName, payload.allow_duplicate_name)
      await assertSlugFree(tx, "project", projects, projectName, payload.url_slug)
      if (payload.client_id) await assertClientExists(tx, payload.client_id)
      await assertCapabilitiesExist(tx, payload.capability_ids ?? [], "capability_ids")
      await assertTeamMembersExist(
        tx,
        (payload.team_members ?? []).map(({ team_member_id }) => team_member_id)
      )

      const [{ id }] = await tx
        .insert(projects)
        .values({
          url_slug: payload.url_slug,
          start_date: start,
          end_date: end,
          location: payload.location,
          webpage: payload.webpage,
          client_id: payload.client_id,
        })
        .returning({ id: projects.id })
        .catch((error) => mapDbError(error, "project"))
      await saveContent(tx, "project", { project_id: id }, DEFAULT_LANGUAGE, {
        name: payload.name,
        summary: payload.summary,
        description: payload.description,
        industry: payload.industry,
        type: payload.type,
      }).catch((error) => mapDbError(error, "project"))
      await saveTranslation(tx, "project", { project_id: id }, payload.translation).catch((error) => mapDbError(error, "project"))

      if (payload.capability_ids?.length) {
        await tx.insert(projectCapabilities).values(payload.capability_ids.map((capabilityId) => ({ project_id: id, capability_id: capabilityId })))
      }
      await insertContributions(tx, id, payload.team_members ?? [])

      return loadTeamProject(tx, id)
    }
  )
}

export async function updateProject(ctx: ServiceContext, { idempotency_key, ...payload }: z.infer<typeof updateProjectInput>) {
  return runMutation(
    ctx,
    { operation: "update_project", idempotencyKey: idempotency_key, payload, recordType: "project", recordId: payload.id },
    async (tx) => {
      assertTranslatablePatch("project", payload.language, payload.patch)
      const current = await lockProject(tx, payload.id)
      assertVersion(payload.expected_version, await currentProjectVersion(tx, current), "project")

      const { start_date, end_date, ...patch } = definedFields(payload.patch)
      const start = start_date ? toDate(start_date) : current.start_date
      const end = end_date === undefined ? current.end_date : toOptionalDate(end_date)
      assertDateRange(start, end)
      if (patch.url_slug) await assertSlugFree(tx, "project", projects, projectName, patch.url_slug, payload.id)
      if (patch.client_id) await assertClientExists(tx, patch.client_id)

      const { shared, content } = splitContent("project", patch)
      const language = payload.language ?? DEFAULT_LANGUAGE
      // Also moves updated_at when only the content changes
      await tx
        .update(projects)
        .set({ ...shared, start_date: start, end_date: end, updated_at: new Date() })
        .where(eq(projects.id, payload.id))
        .catch((error) => mapDbError(error, "project"))
      await saveContent(tx, "project", { project_id: payload.id }, language, content, { replaceDraft: true }).catch((error) =>
        mapDbError(error, "project")
      )

      return loadTeamProject(tx, payload.id, language)
    }
  )
}

// The project and the contribution, read in the language
async function contributionResult(tx: Tx, projectId: string, teamMemberId: string, language: Language = DEFAULT_LANGUAGE) {
  const project = await loadTeamProject(tx, projectId, language)
  const contribution = (await projectContributionRows(tx, projectId, false)).find(({ teamMember }) => teamMember.id === teamMemberId)
  const content = {
    contribution: await contributionContent(tx, projectId, teamMemberId, language),
    teamMember: await loadContentOf(tx, "teamMember", [teamMemberId], language),
  }

  return { id: projectId, project, contribution: contribution ? toTeamContribution(contribution, content) : null }
}

export const contributionResultSchema = z.object({
  id: idSchema.describe("Project id"),
  project: teamProjectSchema,
  contribution: teamContributionSchema.nullable(),
})

export async function addTeamMemberToProject(ctx: ServiceContext, { idempotency_key, ...payload }: z.infer<typeof addTeamMemberToProjectInput>) {
  return runMutation(
    ctx,
    { operation: "add_team_member_to_project", idempotencyKey: idempotency_key, payload, recordType: "project", recordId: payload.project_id },
    async (tx) => {
      const project = await lockProject(tx, payload.project_id)
      assertVersion(payload.expected_version, await currentProjectVersion(tx, project), "project")
      await assertTeamMembersExist(tx, [payload.team_member_id])

      const [existing] = await tx
        .select()
        .from(projectTeamMembers)
        .where(and(eq(projectTeamMembers.project_id, payload.project_id), eq(projectTeamMembers.team_member_id, payload.team_member_id)))
      if (existing) {
        const content = await contributionContent(tx, payload.project_id, payload.team_member_id)
        throw conflict(
          "The team member is already on this project. Review the current contribution and use update_project_contribution to change it.",
          {
            current_contribution: {
              description: content.localize(existing, { team_member_id: payload.team_member_id, project_id: payload.project_id }).description,
              start_date: iso(existing.start_date),
              end_date: isoOrNull(existing.end_date),
              version: linkVersion(existing, content),
            },
          }
        )
      }

      await insertContributions(tx, payload.project_id, [payload])

      return contributionResult(tx, payload.project_id, payload.team_member_id)
    }
  )
}

export async function updateProjectContribution(
  ctx: ServiceContext,
  { idempotency_key, ...payload }: z.infer<typeof updateProjectContributionInput>
) {
  return runMutation(
    ctx,
    { operation: "update_project_contribution", idempotencyKey: idempotency_key, payload, recordType: "project", recordId: payload.project_id },
    async (tx) => {
      assertTranslatablePatch("projectTeamMember", payload.language, payload.patch)
      // The project row lock serializes relationship changes on the project
      await lockProject(tx, payload.project_id)
      const linkFilter = and(eq(projectTeamMembers.project_id, payload.project_id), eq(projectTeamMembers.team_member_id, payload.team_member_id))
      const [current] = await tx.select().from(projectTeamMembers).where(linkFilter).for("update")
      if (!current) {
        throw notFound("contribution of this team member on the project", payload.team_member_id)
      }
      assertVersion(
        payload.expected_version,
        linkVersion(current, await contributionContent(tx, payload.project_id, payload.team_member_id)),
        "contribution"
      )

      const patch = definedFields(payload.patch)
      const start = patch.start_date ? toDate(patch.start_date) : current.start_date
      const end = patch.end_date === undefined ? current.end_date : toOptionalDate(patch.end_date)
      assertDateRange(start, end)

      const language = payload.language ?? DEFAULT_LANGUAGE
      await tx.update(projectTeamMembers).set({ start_date: start, end_date: end }).where(linkFilter)
      await saveContent(
        tx,
        "projectTeamMember",
        { team_member_id: payload.team_member_id, project_id: payload.project_id },
        language,
        { description: patch.description },
        { replaceDraft: true }
      )

      return contributionResult(tx, payload.project_id, payload.team_member_id, language)
    }
  )
}

export const addCapabilitiesResultSchema = z.object({
  id: idSchema.describe("Project id"),
  project: teamProjectSchema,
  added_capability_ids: z.array(idSchema),
  already_linked_capability_ids: z.array(idSchema).describe("Capabilities that were already on the project and were left unchanged"),
})

export async function addCapabilitiesToProject(ctx: ServiceContext, { idempotency_key, ...payload }: z.infer<typeof addCapabilitiesToProjectInput>) {
  return runMutation(
    ctx,
    { operation: "add_capabilities_to_project", idempotencyKey: idempotency_key, payload, recordType: "project", recordId: payload.project_id },
    async (tx) => {
      const project = await lockProject(tx, payload.project_id)
      assertVersion(payload.expected_version, await currentProjectVersion(tx, project), "project")
      await assertCapabilitiesExist(tx, payload.capability_ids, "capability_ids")

      const linked = new Set(
        (
          await tx
            .select({ id: projectCapabilities.capability_id })
            .from(projectCapabilities)
            .where(eq(projectCapabilities.project_id, payload.project_id))
        ).map(({ id }) => id)
      )
      const added = payload.capability_ids.filter((id) => !linked.has(id))
      if (added.length) {
        await tx.insert(projectCapabilities).values(added.map((capabilityId) => ({ project_id: payload.project_id, capability_id: capabilityId })))
      }

      return {
        id: payload.project_id,
        project: await loadTeamProject(tx, payload.project_id),
        added_capability_ids: added,
        already_linked_capability_ids: payload.capability_ids.filter((id) => linked.has(id)),
      }
    }
  )
}
