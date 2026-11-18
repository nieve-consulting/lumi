import type { ModelCallUsage } from "@/ai/usage"
import type {
  CalendarInput,
  CapabilityInput,
  ClientInput,
  CompanyInput,
  ExperienceInput,
  JobOpeningInput,
  ProjectInput,
  ProjectTeamMemberInput,
  TeamMemberCapabilityInput,
  TeamMemberInput,
  ThreadInput,
  WebsiteInput,
} from "@/generated/graphql"
import { deleteConversationBatch } from "@/services/conversationDeletion"
import type { Tx } from "@/services/db"
import { mapDbError, notFound, pgError, ServiceError } from "@/services/errors"
import { assertJobOpeningSlugFree } from "@/services/jobOpenings"
import { projectMissingTranslation } from "@/services/projects"
import { contributionEndDate, type RecordContent } from "@/services/records"
import { toDate } from "@/services/rules"
import { teamMemberMissingTranslation } from "@/services/teamMembers"
import {
  contentSql,
  keyOf,
  loadContent,
  loadContentOf,
  missingTranslation,
  saveContent,
  saveDraft,
  splitContent,
  type LocalizedContent,
  type ReadLanguage,
  type RecordTranslation,
  type SingleKeyRecord,
  type TranslatedContent,
  type TranslatedRecord,
  type TranslationDraft,
  type TranslationKey,
} from "@/services/translations"
import { isPublicCapability, isPublicClient, isPublicJobOpening, isPublicProject, isPublicTeamMember } from "@/services/visibility"
import {
  crawlStartOverdue,
  failQueuedWebsiteCrawl,
  isWebsiteBeingCrawled,
  isWebsiteCrawlStarting,
  lockOutWebsiteCrawls,
  websiteBeingCrawled,
  websiteCrawlLockHeld,
} from "@/services/websiteCrawls"
import type { DbType } from "@db/db"
import {
  adminUsage,
  appointment_settings,
  capabilities,
  clients,
  company,
  dailyConversationSpend,
  experience,
  jobOpenings,
  mcpAuditEvents,
  projectCapabilities,
  projectLocationEnum,
  projects,
  projectTeamMembers,
  projectTeamMemberTranslations,
  teamMemberCapabilities,
  teamMembers,
  threads,
  threadUsage,
  uploads,
  websiteCrawlKind,
  websiteCrawls,
  websitePages,
  websites,
} from "@db/schema"
import type { JobWorkMode } from "@lumi/shared-contracts/knowledge"
import { DEFAULT_LANGUAGE, type Language } from "@lumi/shared-contracts/language"
import { and, AnyColumn, asc, count, desc, eq, getTableColumns, inArray, SQL, sql, sum } from "drizzle-orm"
import { alias } from "drizzle-orm/pg-core"

type ProjectLocationEnum = (typeof projectLocationEnum.enumValues)[number]
type WebsiteCrawlKind = (typeof websiteCrawlKind.enumValues)[number]

// A job opening's values as the admin form sends them: an empty application link means none, and the posting date is a date
// or date-time string. Checked beforehand (checkAdmin.jobOpening)
function jobOpeningValues(input: JobOpeningInput) {
  return {
    ...input,
    work_mode: input.work_mode as JobWorkMode,
    application_url: input.application_url || null,
    posted_at: toDate(input.posted_at),
    published: input.published ?? undefined,
  }
}

// Capabilities sort by their name in the language
const capabilityName = (language: Language) => contentSql("capability", "name", language)

// The row with its content in the language the translations were loaded in, and the content in every language
function withContent<R extends TranslatedRecord, T extends object>(content: RecordContent<R>, row: T, key: TranslationKey<R>) {
  return { ...content.localize(row, key), translations: content.translations(key) }
}

// Saves a record's values in a language: its content only to that language's translation, so the other languages are left
// as they are. The fields every language shares are edited in English, so only an English save writes them to the record;
// another language ignores them, rather than overwriting English edits made since its values were read
async function saveInLanguage<R extends TranslatedRecord, T extends Record<string, unknown>>(
  tx: Tx,
  record: R,
  key: TranslationKey<R>,
  language: Language,
  values: T,
  updateRecord: (shared: Omit<T, keyof TranslatedContent<R>>) => Promise<unknown>
) {
  const { shared, content } = splitContent(record, values)
  // Drizzle rejects an update without values, as for a capability, whose fields are all content
  if (language === DEFAULT_LANGUAGE && Object.values(shared).some((value) => value !== undefined)) await updateRecord(shared)
  await saveContent(tx, record, key, language, content)
}

// Creates a record from its English values: the shared fields to the record, the content to its English translation
async function createInEnglish<R extends TranslatedRecord, T extends Record<string, unknown>>(
  tx: Tx,
  record: R,
  values: T,
  insertRecord: (shared: Omit<T, keyof TranslatedContent<R>>) => Promise<{ id: string }>,
  key: (id: string) => TranslationKey<R>
) {
  const { shared, content } = splitContent(record, values)
  const inserted = await insertRecord(shared)
  await saveContent(tx, record, key(inserted.id), DEFAULT_LANGUAGE, content)

  return inserted
}

// Time zone of the appointments until the settings name one
export const DEFAULT_HOST_TIMEZONE = "Europe/Madrid"

// Postgres error code of an unknown time zone
const INVALID_PARAMETER_VALUE = "22023"

export interface DashboardRange {
  // Whole days ending today, today included
  days: number
  // IANA time zone the days are counted in
  timeZone: string
  // First day of the range in its time zone, as YYYY-MM-DD
  firstDay: string
  // UTC time the range starts at, midnight of its first day in its time zone, as an ISO timestamp without an offset
  start: string
}

// The rows of the range by their created_at column, which holds UTC times
export function inRange(column: AnyColumn, range: DashboardRange) {
  return sql`${column} >= ${range.start}::timestamp`
}

// Token usage and cost per purpose and model of the calls a usage table records that match the filter, most expensive
// first: the conversations' (thread_usage) or the admin's own (admin_usage, marked adminCalls), which share their token and
// cost columns. The cost is null when a call has no price
export async function usageByModel(db: DbType, table: typeof threadUsage | typeof adminUsage, where: SQL) {
  const cost = sql<number | null>`case when bool_or(${table.cost} is null) then null else sum(${table.cost}) end`

  const usage = await db
    .select({
      purpose: table.purpose,
      model: table.model,
      calls: count(),
      inputTokens: sum(table.input_tokens).mapWith(Number),
      cachedInputTokens: sum(table.cached_input_tokens).mapWith(Number),
      cacheWriteTokens: sum(table.cache_write_tokens).mapWith(Number),
      outputTokens: sum(table.output_tokens).mapWith(Number),
      reasoningTokens: sum(table.reasoning_tokens).mapWith(Number),
      cost,
    })
    .from(table)
    .where(where)
    .groupBy(table.purpose, table.model)
    .orderBy(sql`${cost} desc nulls last`)

  return usage.map((model) => ({ ...model, adminCalls: table === adminUsage }))
}

export default class DbDataSource {
  constructor(private dbConnection: DbType) {}

  // Uploads

  async createUpload(contentType: string) {
    return await this.dbConnection
      .insert(uploads)
      .values({ content_type: contentType })
      .returning({ key: uploads.key })
      .then((rows) => rows[0].key)
  }

  async getUploadKey(key: string) {
    return await this.dbConnection.query.uploads.findFirst({ where: (uploads, { eq }) => eq(uploads.key, key) })
  }

  async deleteUpload(key: string) {
    try {
      await this.dbConnection.delete(uploads).where(eq(uploads.key, key))

      return true
    } catch {
      return false
    }
  }

  // Company

  async getCompany() {
    return await this.dbConnection.query.company.findFirst()
  }

  async updateCompany(input: CompanyInput, language: Language = DEFAULT_LANGUAGE) {
    try {
      await this.dbConnection.transaction(async (tx) => {
        // The company is a single record
        const result = await tx.query.company.findFirst({ columns: { id: true } })
        if (!result) {
          // A translation is written from English, so the company is created in English first
          if (language !== DEFAULT_LANGUAGE) throw new Error("The company has no English content to translate")
          await createInEnglish(
            tx,
            "company",
            input,
            (shared) =>
              tx
                .insert(company)
                .values(shared)
                .returning({ id: company.id })
                .then(([row]) => row),
            (id) => ({ company_id: id })
          )
          return
        }

        await saveInLanguage(tx, "company", { company_id: result.id }, language, input, (shared) =>
          tx.update(company).set(shared).where(eq(company.id, result.id))
        )
      })

      return true
    } catch {
      return false
    }
  }

  // Team members

  // Every team member, or those with content left to translate into missingLanguage, their work experiences' included
  // Only published team members unless includeUnpublished
  async getTeamMembers(missingLanguage?: Language, includeUnpublished = false) {
    return await this.dbConnection
      .select()
      .from(teamMembers)
      .where(and(includeUnpublished ? undefined : isPublicTeamMember, missingLanguage ? teamMemberMissingTranslation(missingLanguage) : undefined))
      .orderBy(asc(teamMembers.created_at))
  }

  async getTeamMemberById(id: string) {
    return await this.dbConnection.query.teamMembers.findFirst({ where: (teamMembers, { eq }) => eq(teamMembers.id, id) })
  }

  async getTeamMemberBySlug(slug: string) {
    return await this.dbConnection.query.teamMembers.findFirst({ where: (teamMembers, { eq }) => eq(teamMembers.url_slug, slug) })
  }

  async getTeamMemberByIdWithExperience(id: string) {
    return await this.dbConnection.query.teamMembers.findFirst({
      where: (teamMembers, { eq }) => eq(teamMembers.id, id),
      with: { experiences: true },
    })
  }

  // The project's contributions with their team members, both in the language. Only published team members unless
  // includeUnpublished, since former team members are unpublished
  async getTeamMembersByProjectId(projectId: string, language: ReadLanguage = DEFAULT_LANGUAGE, includeUnpublished = false) {
    const rows = await this.dbConnection
      .select({ teamMembers, projectTeamMembers })
      .from(teamMembers)
      .innerJoin(projectTeamMembers, eq(teamMembers.id, projectTeamMembers.team_member_id))
      .where(and(eq(projectTeamMembers.project_id, projectId), includeUnpublished ? undefined : isPublicTeamMember))
      .orderBy(asc(projectTeamMembers.created_at))
    if (rows.length === 0) return []

    const [teamMemberContent, contributionContent] = await Promise.all([
      loadContentOf(
        this.dbConnection,
        "teamMember",
        rows.map((row) => row.teamMembers.id),
        language
      ),
      loadContent(this.dbConnection, "projectTeamMember", eq(projectTeamMemberTranslations.project_id, projectId), language),
    ])

    return rows.map((row) => {
      const contribution = withContent(contributionContent, {}, { team_member_id: row.projectTeamMembers.team_member_id, project_id: projectId })
      return {
        teamMember: withContent(teamMemberContent, row.teamMembers, { team_member_id: row.teamMembers.id }),
        ...contribution,
        start_date: row.projectTeamMembers.start_date,
        end_date: row.projectTeamMembers.end_date,
      }
    })
  }

  async createTeamMember(input: TeamMemberInput) {
    return await this.dbConnection.transaction(async (tx) => {
      return createInEnglish(
        tx,
        "teamMember",
        { ...input, published: input.published ?? undefined },
        (shared) =>
          tx
            .insert(teamMembers)
            .values(shared)
            .returning({ id: teamMembers.id })
            .then(([row]) => row),
        (id) => ({ team_member_id: id })
      )
    })
  }

  async updateTeamMember(id: string, input: TeamMemberInput, language: Language = DEFAULT_LANGUAGE) {
    try {
      const values = { ...input, published: input.published ?? undefined }
      await this.dbConnection.transaction(async (tx) => {
        await saveInLanguage(tx, "teamMember", { team_member_id: id }, language, values, (set) =>
          tx.update(teamMembers).set(set).where(eq(teamMembers.id, id))
        )
      })

      return true
    } catch {
      return false
    }
  }

  async deleteTeamMember(id: string) {
    try {
      await this.dbConnection.delete(teamMembers).where(eq(teamMembers.id, id))

      return true
    } catch {
      return false
    }
  }

  async linkUploadToTeamMemberPhoto(key: string, teamMemberId: string) {
    try {
      await Promise.all([
        this.dbConnection.update(teamMembers).set({ profile_photo_key: key }).where(eq(teamMembers.id, teamMemberId)),
        this.dbConnection.update(uploads).set({ state: "UPLOADED" }).where(eq(uploads.key, key)),
      ])

      return true
    } catch (e) {
      console.error(e)
      return false
    }
  }

  // Experience

  async getExperienceById(id: string) {
    return await this.dbConnection.query.experience.findFirst({ where: (experience, { eq }) => eq(experience.id, id) })
  }

  async getTeamMemberExperiece(teamMemberId: string) {
    return await this.dbConnection.query.experience.findMany({
      where: (experience, { eq }) => eq(experience.team_member_id, teamMemberId),
      orderBy: [desc(experience.end_date)],
    })
  }

  async addExperiencesToTeamMember(teamMemberId: string, input: ExperienceInput[]) {
    return await this.dbConnection.transaction(async (tx) => {
      const insertedExperience: { id: string }[] = []
      for (const entry of input.filter((input): input is ExperienceInput & { id: undefined } => !input.id)) {
        const values = {
          ...entry,
          start_date: new Date(entry.start_date),
          end_date: entry.end_date ? new Date(entry.end_date) : null,
          team_member_id: teamMemberId,
        }
        insertedExperience.push(
          await createInEnglish(
            tx,
            "experience",
            values,
            (shared) =>
              tx
                .insert(experience)
                .values(shared)
                .returning({ id: experience.id })
                .then(([row]) => row),
            (id) => ({ experience_id: id })
          )
        )
      }

      return insertedExperience
    })
  }

  async updateExperiences(inputs: ExperienceInput[], language: Language = DEFAULT_LANGUAGE) {
    try {
      const updates = inputs.filter((input): input is ExperienceInput & { id: string } => !!input.id)
      await this.dbConnection.transaction(async (tx) => {
        for (const input of updates) {
          const values = { ...input, start_date: new Date(input.start_date), end_date: input.end_date ? new Date(input.end_date) : null }
          await saveInLanguage(tx, "experience", { experience_id: input.id }, language, values, (set) =>
            tx.update(experience).set(set).where(eq(experience.id, input.id))
          )
        }
      })

      return true
    } catch {
      return false
    }
  }

  async removeExperiences(ids: string[]) {
    try {
      await this.dbConnection.delete(experience).where(inArray(experience.id, ids))

      return true
    } catch {
      return false
    }
  }

  async linkUploadToExperienceLogo(key: string, experienceId: string) {
    try {
      await Promise.all([
        this.dbConnection.update(experience).set({ logo_key: key }).where(eq(experience.id, experienceId)),
        this.dbConnection.update(uploads).set({ state: "UPLOADED" }).where(eq(uploads.key, key)),
      ])

      return true
    } catch {
      return false
    }
  }

  // Capabilities
  // Every capability, or those with no translation in missingLanguage
  // Only public capabilities, those a published project or team member uses, unless includeUnpublished
  async getCapabilities(language: Language = DEFAULT_LANGUAGE, missingLanguage?: Language, includeUnpublished = false) {
    return await this.dbConnection
      .select()
      .from(capabilities)
      .where(
        and(includeUnpublished ? undefined : isPublicCapability, missingLanguage ? missingTranslation("capability", missingLanguage) : undefined)
      )
      .orderBy(asc(capabilityName(language)))
  }

  // Undefined for a capability that is not public unless includeUnpublished
  async getCapabilityById(id: string, includeUnpublished = false) {
    const [capability] = await this.dbConnection
      .select()
      .from(capabilities)
      .where(and(eq(capabilities.id, id), includeUnpublished ? undefined : isPublicCapability))
    return capability
  }

  async getTeamMemberCapabilities(teamMemberId: string, language: Language = DEFAULT_LANGUAGE) {
    const rows = await this.dbConnection
      .select({ teamMemberCapabilities })
      .from(teamMemberCapabilities)
      .innerJoin(capabilities, eq(teamMemberCapabilities.capability_id, capabilities.id))
      .where(eq(teamMemberCapabilities.team_member_id, teamMemberId))
      .orderBy(desc(teamMemberCapabilities.stars), asc(capabilityName(language)))

    return rows.map((row) => ({ ...row.teamMemberCapabilities, capability_id: undefined, id: row.teamMemberCapabilities.capability_id as string }))
  }

  async addCapabilitiesToTeamMember(teamMemberId: string, input: TeamMemberCapabilityInput[]) {
    await this.dbConnection
      .insert(teamMemberCapabilities)
      .values(input.map((capability) => ({ team_member_id: teamMemberId, capability_id: capability.id, stars: capability.stars })))

    return true
  }

  async updateTeamMemberCapabilities(consultanId: string, input: TeamMemberCapabilityInput[]) {
    try {
      await Promise.all(
        input.map((capability) =>
          this.dbConnection
            .update(teamMemberCapabilities)
            .set({ stars: capability.stars })
            .where(and(eq(teamMemberCapabilities.team_member_id, consultanId), eq(teamMemberCapabilities.capability_id, capability.id)))
        )
      )

      return true
    } catch {
      return false
    }
  }

  async removeTeamMemberCapabilities(consultanId: string, ids: string[]) {
    try {
      await Promise.all(
        ids.map((id) =>
          this.dbConnection
            .delete(teamMemberCapabilities)
            .where(and(eq(teamMemberCapabilities.team_member_id, consultanId), eq(teamMemberCapabilities.capability_id, id)))
        )
      )
      return true
    } catch {
      return false
    }
  }

  async getProjectCapabilities(projectId: string, language: Language = DEFAULT_LANGUAGE) {
    const rows = await this.dbConnection
      .select({ capability: capabilities })
      .from(projectCapabilities)
      .innerJoin(capabilities, eq(projectCapabilities.capability_id, capabilities.id))
      .where(eq(projectCapabilities.project_id, projectId))
      .orderBy(asc(capabilityName(language)))

    return rows.map((row) => row.capability)
  }
  async addCapabilitiesToProject(projectId: string, ids: string[]) {
    await this.dbConnection.insert(projectCapabilities).values(ids.map((capabilityId) => ({ project_id: projectId, capability_id: capabilityId })))

    return true
  }

  async removeProjectCapabilities(projectId: string, ids: string[]) {
    try {
      await Promise.all(
        ids.map((id) =>
          this.dbConnection
            .delete(projectCapabilities)
            .where(and(eq(projectCapabilities.project_id, projectId), eq(projectCapabilities.capability_id, id)))
        )
      )
      return true
    } catch {
      return false
    }
  }

  async createCapability(input: CapabilityInput) {
    return await this.dbConnection.transaction(async (tx) => {
      // Every field of a capability is content, which its English translation holds
      const [inserted] = await tx.insert(capabilities).values({}).returning({ id: capabilities.id })
      await saveContent(tx, "capability", { capability_id: inserted.id }, DEFAULT_LANGUAGE, input)

      return inserted
    })
  }

  async updateCapability(id: string, input: CapabilityInput, language: Language = DEFAULT_LANGUAGE) {
    try {
      await this.dbConnection.transaction(async (tx) => {
        await saveContent(tx, "capability", { capability_id: id }, language, input)
        // A capability has no shared fields to update, so its updated_at is moved explicitly
        await tx.update(capabilities).set({ updated_at: new Date() }).where(eq(capabilities.id, id))
      })

      return true
    } catch {
      return false
    }
  }

  async deleteCapability(id: string) {
    try {
      await this.dbConnection.delete(capabilities).where(eq(capabilities.id, id))

      return true
    } catch {
      return false
    }
  }

  // Projects

  // Published projects, or every project with includeUnpublished, optionally only those with content left to translate into
  // missingLanguage, their contributions' included
  async getProjects(missingLanguage?: Language, includeUnpublished = false) {
    return this.dbConnection
      .select()
      .from(projects)
      .where(and(includeUnpublished ? undefined : isPublicProject, missingLanguage ? projectMissingTranslation(missingLanguage) : undefined))
      .orderBy(asc(projects.start_date))
  }

  async getProjectById(id: string) {
    return this.dbConnection.query.projects.findFirst({ where: (projects, { eq }) => eq(projects.id, id) })
  }

  async getProjectBySlug(slug: string) {
    return await this.dbConnection.query.projects.findFirst({ where: (projects, { eq }) => eq(projects.url_slug, slug) })
  }

  // The team member's contributions with their projects, both in the language, ending when the contribution ended, ongoing
  // first. Only published projects unless includeUnpublished
  async getProjectContributions(teamMemberId: string, language: ReadLanguage = DEFAULT_LANGUAGE, includeUnpublished = false) {
    const rows = await this.dbConnection
      .select({ projects, projectTeamMembers, ended: contributionEndDate })
      .from(projects)
      .innerJoin(projectTeamMembers, eq(projects.id, projectTeamMembers.project_id))
      .where(and(eq(projectTeamMembers.team_member_id, teamMemberId), includeUnpublished ? undefined : isPublicProject))
      .orderBy(desc(contributionEndDate), desc(projectTeamMembers.start_date), asc(contentSql("project", "name", language)))
    if (rows.length === 0) return []

    const [projectContent, contributionContent] = await Promise.all([
      loadContentOf(
        this.dbConnection,
        "project",
        rows.map((row) => row.projects.id),
        language
      ),
      loadContent(this.dbConnection, "projectTeamMember", eq(projectTeamMemberTranslations.team_member_id, teamMemberId), language),
    ])

    return rows.map((row) => ({
      project: withContent(projectContent, row.projects, { project_id: row.projects.id }),
      ...withContent(
        contributionContent,
        { ...row.projectTeamMembers, end_date: row.ended },
        { team_member_id: teamMemberId, project_id: row.projects.id }
      ),
    }))
  }

  async createProject(input: ProjectInput) {
    return await this.dbConnection.transaction(async (tx) => {
      const values = {
        ...input,
        start_date: new Date(input.start_date),
        end_date: input.end_date ? new Date(input.end_date) : null,
        location: input.location as ProjectLocationEnum,
        published: input.published ?? undefined,
      }
      return createInEnglish(
        tx,
        "project",
        values,
        (shared) =>
          tx
            .insert(projects)
            .values(shared)
            .returning({ id: projects.id })
            .then(([row]) => row),
        (id) => ({ project_id: id })
      )
    })
  }

  async updateProject(id: string, input: ProjectInput, language: Language = DEFAULT_LANGUAGE) {
    try {
      const values = {
        ...input,
        start_date: new Date(input.start_date),
        end_date: input.end_date ? new Date(input.end_date) : null,
        client_id: input.client_id || null,
        location: input.location as ProjectLocationEnum,
        published: input.published ?? undefined,
      }
      await this.dbConnection.transaction(async (tx) => {
        await saveInLanguage(tx, "project", { project_id: id }, language, values, (set) => tx.update(projects).set(set).where(eq(projects.id, id)))
      })

      return true
    } catch (e) {
      console.error(e)
      return false
    }
  }

  // Deletes the project and returns its image's key (null without an image), read by the same statement so an image linked
  // just before is not missed. Undefined when there is no such project. A failed delete throws
  async deleteProject(id: string) {
    const [deleted] = await this.dbConnection.delete(projects).where(eq(projects.id, id)).returning({ image_key: projects.image_key })
    return deleted
  }

  async addTeamMembersToProject(projectId: string, teamMemberIds: ProjectTeamMemberInput[]) {
    await this.dbConnection.transaction(async (tx) => {
      await tx.insert(projectTeamMembers).values(
        teamMemberIds.map((teamMember) => ({
          project_id: projectId,
          team_member_id: teamMember.team_member_id,
          start_date: new Date(teamMember.start_date),
          end_date: teamMember.end_date ? new Date(teamMember.end_date) : null,
        }))
      )
      for (const { team_member_id, description } of teamMemberIds) {
        await saveContent(tx, "projectTeamMember", { team_member_id, project_id: projectId }, DEFAULT_LANGUAGE, { description })
      }
    })

    return true
  }

  async updateProjectTeamMember(projectId: string, teamMembers: ProjectTeamMemberInput[], language: Language = DEFAULT_LANGUAGE) {
    try {
      await this.dbConnection.transaction(async (tx) => {
        for (const teamMember of teamMembers) {
          const values = {
            description: teamMember.description,
            start_date: new Date(teamMember.start_date),
            end_date: teamMember.end_date ? new Date(teamMember.end_date) : null,
          }
          const key = { team_member_id: teamMember.team_member_id, project_id: projectId }
          await saveInLanguage(tx, "projectTeamMember", key, language, values, (set) =>
            tx
              .update(projectTeamMembers)
              .set(set)
              .where(and(eq(projectTeamMembers.project_id, projectId), eq(projectTeamMembers.team_member_id, teamMember.team_member_id)))
          )
        }
      })

      return true
    } catch (e) {
      console.error(e)
      return false
    }
  }

  async removeTeamMembersFromProject(projectId: string, teamMemberIds: string[]) {
    await this.dbConnection
      .delete(projectTeamMembers)
      .where(and(eq(projectTeamMembers.project_id, projectId), inArray(projectTeamMembers.team_member_id, teamMemberIds)))

    return true
  }

  async linkUploadToProjectImage(key: string, projectId: string) {
    try {
      await Promise.all([
        this.dbConnection.update(projects).set({ image_key: key }).where(eq(projects.id, projectId)),
        this.dbConnection.update(uploads).set({ state: "UPLOADED" }).where(eq(uploads.key, key)),
      ])

      return true
    } catch (e) {
      console.error(e)
      return false
    }
  }

  // Clients

  // Every client, or those with no translation in missingLanguage
  // Only published clients unless includeUnpublished
  async getClients(missingLanguage?: Language, includeUnpublished = false) {
    return await this.dbConnection
      .select()
      .from(clients)
      .where(and(includeUnpublished ? undefined : isPublicClient, missingLanguage ? missingTranslation("client", missingLanguage) : undefined))
  }

  async getClientById(id: string) {
    return await this.dbConnection.query.clients.findFirst({ where: (clients, { eq }) => eq(clients.id, id), orderBy: [asc(clients.created_at)] })
  }

  async getClientBySlug(slug: string) {
    return await this.dbConnection.query.clients.findFirst({ where: (clients, { eq }) => eq(clients.url_slug, slug) })
  }

  // Only published projects unless includeUnpublished
  async getClientProjects(clientId: string, includeUnpublished = false) {
    return await this.dbConnection
      .select()
      .from(projects)
      .where(and(eq(projects.client_id, clientId), includeUnpublished ? undefined : isPublicProject))
  }

  async createClient(input: ClientInput) {
    return await this.dbConnection.transaction(async (tx) => {
      return createInEnglish(
        tx,
        "client",
        { ...input, published: input.published ?? undefined },
        (shared) =>
          tx
            .insert(clients)
            .values(shared)
            .returning({ id: clients.id })
            .then(([row]) => row),
        (id) => ({ client_id: id })
      )
    })
  }

  async updateClient(id: string, input: ClientInput, language: Language = DEFAULT_LANGUAGE) {
    try {
      const values = { ...input, published: input.published ?? undefined }
      await this.dbConnection.transaction(async (tx) => {
        await saveInLanguage(tx, "client", { client_id: id }, language, values, (set) => tx.update(clients).set(set).where(eq(clients.id, id)))
      })

      return true
    } catch {
      return false
    }
  }

  async deleteClient(id: string) {
    try {
      await this.dbConnection.delete(clients).where(eq(clients.id, id))

      return true
    } catch {
      return false
    }
  }

  async linkUploadToClientLogo(key: string, clientId: string) {
    try {
      await Promise.all([
        this.dbConnection.update(clients).set({ logo_key: key }).where(eq(clients.id, clientId)),
        this.dbConnection.update(uploads).set({ state: "UPLOADED" }).where(eq(uploads.key, key)),
      ])

      return true
    } catch {
      return false
    }
  }

  // Job openings

  // Every job opening, or those with no translation in missingLanguage, most recently posted first
  // Only published job openings unless includeUnpublished
  async getJobOpenings(missingLanguage?: Language, includeUnpublished = false) {
    return await this.dbConnection
      .select()
      .from(jobOpenings)
      .where(
        and(includeUnpublished ? undefined : isPublicJobOpening, missingLanguage ? missingTranslation("jobOpening", missingLanguage) : undefined)
      )
      .orderBy(desc(jobOpenings.posted_at), asc(jobOpenings.id))
  }

  async getJobOpeningById(id: string) {
    return await this.dbConnection.query.jobOpenings.findFirst({ where: (jobOpenings, { eq }) => eq(jobOpenings.id, id) })
  }

  async getJobOpeningBySlug(slug: string) {
    return await this.dbConnection.query.jobOpenings.findFirst({ where: (jobOpenings, { eq }) => eq(jobOpenings.url_slug, slug) })
  }

  // A slug another job opening uses throws a ServiceError conflict that names it, as the MCP tools report it
  async createJobOpening(input: JobOpeningInput) {
    return await this.dbConnection.transaction(async (tx) => {
      await assertJobOpeningSlugFree(tx, input.url_slug)
      return createInEnglish(
        tx,
        "jobOpening",
        jobOpeningValues(input),
        (shared) =>
          tx
            .insert(jobOpenings)
            .values(shared)
            .returning({ id: jobOpenings.id })
            .then(([row]) => row)
            .catch((error) => mapDbError(error, "job opening")),
        (id) => ({ job_opening_id: id })
      )
    })
  }

  // False when the save fails, except a slug another job opening uses, which throws its ServiceError conflict. Only English
  // saves the slug
  async updateJobOpening(id: string, input: JobOpeningInput, language: Language = DEFAULT_LANGUAGE) {
    try {
      await this.dbConnection.transaction(async (tx) => {
        if (language === DEFAULT_LANGUAGE) await assertJobOpeningSlugFree(tx, input.url_slug, id)
        await saveInLanguage(tx, "jobOpening", { job_opening_id: id }, language, jobOpeningValues(input), (set) =>
          tx
            .update(jobOpenings)
            .set(set)
            .where(eq(jobOpenings.id, id))
            .catch((error) => mapDbError(error, "job opening"))
        )
      })

      return true
    } catch (e) {
      if (e instanceof ServiceError && e.code === "conflict") throw e
      return false
    }
  }

  async deleteJobOpening(id: string) {
    try {
      await this.dbConnection.delete(jobOpenings).where(eq(jobOpenings.id, id))

      return true
    } catch {
      return false
    }
  }

  // Content per language: the rows with their content in the language, falling back to English, and the content in every
  // language for the admin, loading the translations of all the rows in one query. Capabilities also take a team member's capabilities,
  // whose names it reads in the language
  async localize<R extends SingleKeyRecord, T extends { id: string }>(
    record: R,
    rows: T[],
    language: ReadLanguage
  ): Promise<
    (Omit<T, keyof LocalizedContent<R>> &
      LocalizedContent<R> & { language: Language; fallback_fields: string[]; translations: RecordTranslation<R>[] })[]
  > {
    if (rows.length === 0) return []
    const content = await loadContentOf(
      this.dbConnection,
      record,
      rows.map(({ id }) => id),
      language
    )

    return rows.map((row) => withContent(content, row, keyOf(record, row.id)))
  }

  // Saves translations into the language as drafts for review, all of them or none, skipping records already translated in
  // it, unless `replaceOutdated` and their translation is outdated. Returns how many were saved, and how many of their
  // fields were left untranslated (saveDraft)
  async saveTranslationDrafts(language: Language, drafts: TranslationDraft[], options: { replaceOutdated?: boolean } = {}) {
    return await this.dbConnection.transaction(async (tx) => {
      const result = { saved: 0, untranslated: 0 }
      // One after the other: a transaction runs on a single connection
      for (const { record, key, content, source } of drafts) {
        const { saved, untranslated } = await saveDraft(tx, record, key, language, content, source, options)
        if (saved) result.saved++
        result.untranslated += untranslated
      }
      return result
    })
  }

  // Websites

  async getWebsites() {
    return await this.dbConnection.query.websites.findMany()
  }

  async getWebsiteById(id: string) {
    return await this.dbConnection.query.websites.findFirst({ where: (websites, { eq }) => eq(websites.id, id) })
  }

  async createWebsite(input: WebsiteInput) {
    const insertedWebsites = await this.dbConnection
      .insert(websites)
      .values({ ...input, exclude_paths: (input.exclude_paths as string[]) || undefined })
      .returning({ id: websites.id })

    return insertedWebsites[0]
  }

  async updateWebsite(id: string, input: WebsiteInput) {
    try {
      await this.dbConnection
        .update(websites)
        .set({ ...input, exclude_paths: (input.exclude_paths as string[]) || undefined })
        .where(eq(websites.id, id))

      return true
    } catch {
      return false
    }
  }

  // Deleting a website deletes its pages, and so their vectors (website_page_vectors.webpage_id)
  async deleteWebsite(id: string) {
    try {
      await this.dbConnection.delete(websites).where(eq(websites.id, id))

      return true
    } catch {
      return false
    }
  }

  // Deleting the pages deletes their vectors (website_page_vectors.webpage_id). Refused while the website is being crawled or a
  // crawl is starting, which Re-process would otherwise only find once it had cleared the pages
  async clearProcessedWebsitePages(id: string) {
    try {
      // One after the other: a transaction runs on a single connection, which pg does not let run queries concurrently
      await this.dbConnection.transaction(async (trx) => {
        if (!(await lockOutWebsiteCrawls(trx, id))) throw websiteBeingCrawled()
        // Updating the website's row first waits for a crawl being queued, which locks it, so the check below sees that crawl
        await trx.update(websites).set({ last_processed: null }).where(eq(websites.id, id))
        if (await isWebsiteCrawlStarting(trx, id)) throw websiteBeingCrawled()
        await trx.delete(websitePages).where(eq(websitePages.website_id, id))
      })

      return true
    } catch (e) {
      if (e instanceof ServiceError) throw e
      console.error(e)
      return false
    }
  }

  // Each website's latest crawl, of the websites given or all of them, with what its status needs: whether a crawl holds the
  // website's lock, and whether a queued crawl should have started by now. Each website's crawls are read through the index up
  // to the latest, so neither the lock nor the history of crawls is read for the others
  async getLatestWebsiteCrawls(websiteIds?: string[]) {
    const crawl = alias(websiteCrawls, "crawl")
    const latestIds = this.dbConnection
      .select({
        id: sql`(${this.dbConnection
          .select({ id: crawl.id })
          .from(crawl)
          .where(eq(crawl.website_id, websites.id))
          .orderBy(desc(crawl.created_at))
          .limit(1)})`,
      })
      .from(websites)
      .where(websiteIds ? inArray(websites.id, websiteIds) : undefined)

    return this.dbConnection
      .select({
        ...getTableColumns(websiteCrawls),
        lock_held: websiteCrawlLockHeld(websiteCrawls.website_id),
        start_overdue: crawlStartOverdue(websiteCrawls.created_at),
      })
      .from(websiteCrawls)
      .where(inArray(websiteCrawls.id, latestIds))
  }

  // Queues a crawl of the website for the crawler to pick up, unless one is running or another is starting. Locking the
  // website's row makes requests at the same time, as from a double click, wait for each other, so only the first is queued
  async queueWebsiteCrawl(id: string, kind: WebsiteCrawlKind, adminEmail: string | undefined) {
    return this.dbConnection.transaction(async (trx) => {
      const [website] = await trx.select({ id: websites.id }).from(websites).where(eq(websites.id, id)).for("update")
      if (!website) throw notFound("website", id)

      // The lock is checked with the id as stored, which the crawl hashes
      if (await isWebsiteBeingCrawled(trx, website.id)) throw websiteBeingCrawled()
      if (await isWebsiteCrawlStarting(trx, website.id)) throw websiteBeingCrawled()

      const [crawl] = await trx
        .insert(websiteCrawls)
        .values({ website_id: website.id, kind, admin_email: adminEmail })
        .returning({ id: websiteCrawls.id })
      return { websiteId: website.id, crawlId: crawl.id }
    })
  }

  async failQueuedWebsiteCrawl(id: string, error: string) {
    await failQueuedWebsiteCrawl(this.dbConnection, id, error)
  }

  // Chat History

  async getThread(id: string) {
    return this.dbConnection.query.threads.findFirst({ where: (threads, { eq }) => eq(threads.id, id) })
  }

  // The thread, with its last activity stamped now, or undefined when it doesn't exist. For the agents API's routes that act for
  // the visitor (a turn, a booking, an enquiry), before they save anything: the update waits for a conversation deletion holding
  // the thread, and finds it gone, while one that starts later sees the stamp and keeps the conversation
  async markThreadActive(id: string) {
    const [thread] = await this.dbConnection
      .update(threads)
      .set({ last_activity_at: sql`now() at time zone 'UTC'` })
      .where(eq(threads.id, id))
      .returning()
    return thread
  }

  async listThreads() {
    return this.dbConnection.query.threads.findMany({ orderBy: [desc(threads.created_at)] })
  }

  // Token usage and cost of a thread per purpose and model, most expensive first. The cost is null when a call has no price
  async getThreadUsage(threadId: string) {
    return this.getUsage(eq(threadUsage.thread_id, threadId))
  }

  // Token usage and cost per purpose and model of the conversations' calls matching the filter, most expensive first
  private async getUsage(where: SQL) {
    return usageByModel(this.dbConnection, threadUsage, where)
  }

  // Saves the calls and adds their cost to the thread and the independent UTC-day spending total in one transaction.
  // Errors are logged rather than thrown so failing to record usage never fails the conversation
  async addThreadUsage(threadId: string, usage: ModelCallUsage[]) {
    const cost = usage.reduce((total, call) => total + (call.cost ?? 0), 0)
    const unpricedCalls = usage.filter((call) => call.cost === null).length

    try {
      await this.dbConnection.transaction(async (trx) => {
        // Deletion locks the thread first too. If it already disappeared while the model was replying, keep the cost
        // without recreating visitor data; otherwise hold the lock until detail and totals have been saved together.
        const [thread] = await trx.select({ id: threads.id }).from(threads).where(eq(threads.id, threadId)).for("update")
        if (thread) {
          await trx.insert(threadUsage).values(
            usage.map((call) => ({
              thread_id: threadId,
              model: call.model,
              purpose: call.purpose,
              input_tokens: call.inputTokens,
              cached_input_tokens: call.cachedInputTokens,
              cache_write_tokens: call.cacheWriteTokens,
              output_tokens: call.outputTokens,
              reasoning_tokens: call.reasoningTokens,
              cost: call.cost,
            }))
          )
          await trx
            .update(threads)
            .set({ cost: sql`coalesce(${threads.cost}, 0) + ${cost}`, unpriced_calls: sql`${threads.unpriced_calls} + ${unpricedCalls}` })
            .where(eq(threads.id, threadId))
        }
        await trx
          .insert(dailyConversationSpend)
          .values({ day: sql`(now() at time zone 'UTC')::date`, cost })
          .onConflictDoUpdate({ target: dailyConversationSpend.day, set: { cost: sql`${dailyConversationSpend.cost} + ${cost}` } })
      })
    } catch (error) {
      console.error("Error recording the usage of thread", threadId, error)
    }
  }

  async createThread(pageUrl?: string) {
    const insertedThreads = await this.dbConnection.insert(threads).values({ page_url: pageUrl }).returning({ id: threads.id })

    return insertedThreads[0]
  }

  async deleteThread(id: string) {
    try {
      // The thread and its checkpoints in one transaction; its enquiries, deliveries and usage records cascade
      await deleteConversationBatch(this.dbConnection.$client, [id])

      return true
    } catch {
      return false
    }
  }

  async updateThread(id: string, input: ThreadInput) {
    try {
      await this.dbConnection
        .update(threads)
        .set({
          closed: input.closed || undefined,
          topic: input.topic,
          summary: input.summary,
          email: input.email || undefined,
          phone: input.phone || undefined,
          name: input.name || undefined,
        })
        .where(eq(threads.id, id))

      return true
    } catch {
      return false
    }
  }

  // Dashboard: the ranges are whole days in the time zone, ending today. created_at columns hold UTC times

  // The last days ending today in the appointment settings time zone, or the one appointments use until it is set. Computed once
  // for every dashboard query, so they all count the same days even when they run around midnight
  async getDashboardRange(days: number): Promise<DashboardRange> {
    const timeZone = sql`coalesce(nullif((select ${appointment_settings.host_timezone} from ${appointment_settings} limit 1), ''), ${DEFAULT_HOST_TIMEZONE})`

    try {
      return await this.getDashboardRangeIn(days, timeZone)
    } catch (error) {
      // The time zone was picked from the admin's browser, whose list can hold names this Postgres does not know
      if (pgError(error)?.code !== INVALID_PARAMETER_VALUE) throw error

      console.warn("The appointment settings time zone is unknown to the database, so the dashboard counts days in UTC")
      return this.getDashboardRangeIn(days, sql`'UTC'`)
    }
  }

  private async getDashboardRangeIn(days: number, timeZone: SQL): Promise<DashboardRange> {
    const result = await this.dbConnection.execute<Omit<DashboardRange, "days">>(sql`
      with zone as (
        select ${timeZone} as name
      ),
      first_day as (
        select name, date_trunc('day', now() at time zone name) - make_interval(days => ${days - 1}::int) as day from zone
      )
      select
        name as "timeZone",
        to_char(day, 'YYYY-MM-DD') as "firstDay",
        to_char(day at time zone name at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS') as start
      from first_day
    `)

    return { days, ...result.rows[0] }
  }

  // Conversations, leads, meetings and the cost of the model calls per day, the conversations' and the admin's own, one row
  // per day of the range including the days without any
  async getDashboardActivity(range: DashboardRange) {
    const day = (column: AnyColumn) => sql`(${column} at time zone 'UTC' at time zone ${range.timeZone})::date`
    const hasContact = sql`(coalesce(${threads.email}, '') <> '' or coalesce(${threads.phone}, '') <> '')`

    const result = await this.dbConnection.execute<{
      date: string
      conversations: number
      leads: number
      meetings: number
      cost: number
      unpricedCalls: number
    }>(sql`
      with days as (
        select ${range.firstDay}::date + n as day from generate_series(0, ${range.days - 1}::int) as n
      ),
      conversations as (
        select
          ${day(threads.created_at)} as day,
          count(*)::int as conversations,
          (count(*) filter (where ${hasContact}))::int as leads,
          (count(*) filter (where ${threads.closed}))::int as meetings
        from ${threads}
        where ${inRange(threads.created_at, range)}
        group by 1
      ),
      calls as (
        select ${day(threadUsage.created_at)} as day, ${threadUsage.cost} as cost
        from ${threadUsage}
        where ${inRange(threadUsage.created_at, range)}
        union all
        select ${day(adminUsage.created_at)} as day, ${adminUsage.cost} as cost
        from ${adminUsage}
        where ${inRange(adminUsage.created_at, range)}
      ),
      usage as (
        select
          day,
          coalesce(sum(cost), 0)::float8 as cost,
          (count(*) filter (where cost is null))::int as unpriced_calls
        from calls
        group by day
      )
      select
        to_char(days.day, 'YYYY-MM-DD') as date,
        coalesce(conversations.conversations, 0) as conversations,
        coalesce(conversations.leads, 0) as leads,
        coalesce(conversations.meetings, 0) as meetings,
        coalesce(usage.cost, 0) as cost,
        coalesce(usage.unpriced_calls, 0) as "unpricedCalls"
      from days
      left join conversations using (day)
      left join usage using (day)
      order by days.day
    `)

    return result.rows
  }

  // Total cost of the conversations started in the range, their calls made since included. Null while one of them has calls
  // without a price, as for a single conversation
  async getDashboardConversationsCost(range: DashboardRange) {
    const [{ cost }] = await this.dbConnection
      .select({ cost: sql<number | null>`case when bool_or(${threads.unpriced_calls} > 0) then null else coalesce(sum(${threads.cost}), 0) end` })
      .from(threads)
      .where(inRange(threads.created_at, range))

    return cost
  }

  async getDashboardUsage(range: DashboardRange) {
    return this.getUsage(inRange(threadUsage.created_at, range))
  }

  // Latest conversations of the range that left an email or a phone number
  async getDashboardLeads(range: DashboardRange, limit: number) {
    return this.dbConnection.query.threads.findMany({
      where: (threads, { and, or, ne }) => and(inRange(threads.created_at, range), or(ne(threads.email, ""), ne(threads.phone, ""))),
      orderBy: [desc(threads.created_at)],
      limit,
    })
  }

  // Published and total counts of the records Lumi can present
  async getDashboardContent() {
    type PublishedCount = { total: number; published: number }
    const counts = (table: typeof teamMembers | typeof projects | typeof clients | typeof jobOpenings) =>
      sql`(select json_build_object('total', count(*), 'published', count(*) filter (where ${table.published})) from ${table})`

    const result = await this.dbConnection.execute<{
      teamMembers: PublishedCount
      projects: PublishedCount
      clients: PublishedCount
      capabilities: number
      jobOpenings: PublishedCount
    }>(sql`
      select
        ${counts(teamMembers)} as "teamMembers",
        ${counts(projects)} as projects,
        ${counts(clients)} as clients,
        (select count(*)::int from ${capabilities}) as capabilities,
        ${counts(jobOpenings)} as "jobOpenings"
    `)

    return result.rows[0]
  }

  // Websites with the number of their pages Lumi can search: those a crawl processed, unlike a page whose first crawl failed
  async getDashboardWebsites() {
    return this.dbConnection
      .select({
        id: websites.id,
        name: websites.name,
        url: websites.url,
        lastProcessed: websites.last_processed,
        pages: count(websitePages.last_processed),
      })
      .from(websites)
      .leftJoin(websitePages, eq(websitePages.website_id, websites.id))
      .groupBy(websites.id)
      .orderBy(asc(websites.name))
  }

  // MCP writes of the range: totals and the latest events. The totals are window counts over the whole range, which run before
  // the limit, so one query returns both
  async getDashboardMcpActivity(range: DashboardRange, limit: number) {
    const rows = await this.dbConnection
      .select({
        event: {
          id: mcpAuditEvents.id,
          createdAt: mcpAuditEvents.created_at,
          actorEmail: mcpAuditEvents.actor_email,
          tool: mcpAuditEvents.tool,
          recordType: mcpAuditEvents.record_type,
          recordId: mcpAuditEvents.record_id,
          outcome: mcpAuditEvents.outcome,
        },
        calls: sql<number>`count(*) over ()`.mapWith(Number),
        errors: sql<number>`count(*) filter (where ${mcpAuditEvents.outcome} <> 'success') over ()`.mapWith(Number),
      })
      .from(mcpAuditEvents)
      .where(inRange(mcpAuditEvents.created_at, range))
      .orderBy(desc(mcpAuditEvents.created_at))
      .limit(limit)

    return { calls: rows[0]?.calls ?? 0, errors: rows[0]?.errors ?? 0, recent: rows.map((row) => row.event) }
  }

  // Appointment Settings

  async getAppointmentSettings() {
    return this.dbConnection.query.appointment_settings.findFirst()
  }

  async upsertAppointmentSettings(input: CalendarInput) {
    try {
      const result = await this.dbConnection.query.appointment_settings.findFirst({ columns: { id: true } })
      if (!result) {
        const data = {
          meeting_duration: input.meetingDurationMins || 45,
          allowed_times: input.allowedTimes || [
            { hour: 9, minutes: 30 },
            { hour: 17, minutes: 30 },
          ],
          time_before_slot: input.minAvailableTimeBeforeSlot || 5,
          allowed_days: input.allowedDays || [1, 2, 3, 4, 5],
          same_day_min_hours: input.sameDayMinHours || 4,
          max_days_out: input.maxDaysOut || 60,
          host_timezone: input.hostTimezone || DEFAULT_HOST_TIMEZONE,
          calendars: input.calendars || [],
          booking_email: input.bookingEmail || "",
        }

        await this.dbConnection.insert(appointment_settings).values(data)
      } else {
        const data = {
          meeting_duration: input.meetingDurationMins || undefined,
          allowed_times: input.allowedTimes || undefined,
          time_before_slot: input.minAvailableTimeBeforeSlot || undefined,
          allowed_days: input.allowedDays || undefined,
          same_day_min_hours: input.sameDayMinHours || undefined,
          max_days_out: input.maxDaysOut || undefined,
          host_timezone: input.hostTimezone || undefined,
          calendars: input.calendars || undefined,
          booking_email: input.bookingEmail || undefined,
        }

        await this.dbConnection.update(appointment_settings).set(data).where(eq(appointment_settings.id, result.id))
      }

      return true
    } catch (e) {
      console.error(e)
      return false
    }
  }
}
