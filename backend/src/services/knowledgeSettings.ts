import { capabilities, clients, jobOpenings, knowledgeSettings, projects, teamMembers } from "@db/schema"
import {
  DEFAULT_SOURCE_LABELS,
  SOURCE_KEYS,
  sourceLabels,
  sourceLabelsSchema,
  sourcesInUse,
  type KnowledgeSources,
  type SourceLabels,
  type StructuredSources,
} from "@lumi/shared-contracts/knowledge"
import { sql } from "drizzle-orm"

import type { Queryable } from "./db"
import { ServiceError } from "./errors"
import { isPublicCapability, isPublicClient, isPublicJobOpening, isPublicProject, isPublicTeamMember } from "./visibility"

// Which structured sources (team members, projects, clients, capabilities, job openings) the chat, the MCP server and the
// admin navigation use, and the labels they go by: a single record admins edit in Settings → Knowledge sources. Until it
// exists, a source is on when it has a published record, so an installation that already uses one keeps it and a new one
// starts without any, and every label is its default. The agents and the MCP server read the sources through
// src/knowledge.ts, which caches them

export type KnowledgeSettingsRecord = typeof knowledgeSettings.$inferSelect

// The structured sources and every label, as an admin saves them
export type StructuredSourcesInput = StructuredSources & { labels: SourceLabels }

export type KnowledgeSettingsProblem = { field: string; message: string }

// Labels that fail the checks, each by its field (e.g. labels.teamMembers.plural) for the form to show next to it
export class KnowledgeSettingsError extends ServiceError {
  constructor(readonly problems: KnowledgeSettingsProblem[]) {
    super("invalid_input", `Invalid knowledge sources:\n${problems.map(({ field, message }) => `- ${field}: ${message}`).join("\n")}`, { problems })
    this.name = "KnowledgeSettingsError"
  }
}

// The record, or null until the sources are first saved
export async function getKnowledgeSettings(db: Queryable): Promise<KnowledgeSettingsRecord | null> {
  const [record] = await db.select().from(knowledgeSettings).limit(1)
  return record ?? null
}

// The sources until an admin saves them: those with at least one published record. Capabilities have no flag of their own,
// so they are on while one is public (linked to a published team member or project) and team members or projects are on
async function defaultStructuredSources(db: Queryable): Promise<StructuredSources> {
  const result = await db.execute<StructuredSources>(sql`
    select
      exists (select 1 from ${teamMembers} where ${isPublicTeamMember}) as "teamMembers",
      exists (select 1 from ${projects} where ${isPublicProject}) as projects,
      exists (select 1 from ${clients} where ${isPublicClient}) as clients,
      exists (select 1 from ${capabilities} where ${isPublicCapability}) as capabilities,
      exists (select 1 from ${jobOpenings} where ${isPublicJobOpening}) as "jobOpenings"
  `)
  const [row] = result.rows
  return sourcesInUse({
    teamMembers: row.teamMembers === true,
    projects: row.projects === true,
    clients: row.clients === true,
    capabilities: row.capabilities === true,
    jobOpenings: row.jobOpenings === true,
  })
}

// The sources the chat answers from, their labels, and whether an admin saved them
export async function readKnowledgeSources(db: Queryable): Promise<KnowledgeSources & { saved: boolean }> {
  const record = await getKnowledgeSettings(db)
  const structured: StructuredSources = record
    ? {
        teamMembers: record.team_members_enabled,
        projects: record.projects_enabled,
        clients: record.clients_enabled,
        capabilities: record.capabilities_enabled,
        jobOpenings: record.job_openings_enabled,
      }
    : await defaultStructuredSources(db)
  return { ...structured, labels: sourceLabels(record?.labels), saved: record !== null }
}

// Checks every label and returns those that differ from their default, the only ones stored, so a default changed later
// reaches every label an admin left as it was. Throws a KnowledgeSettingsError
function changedLabels(labels: SourceLabels): Partial<SourceLabels> {
  const result = sourceLabelsSchema.safeParse(labels)
  if (!result.success) {
    throw new KnowledgeSettingsError(
      result.error.issues.map((issue) => ({ field: ["labels", ...issue.path.map(String)].join("."), message: issue.message }))
    )
  }
  const checked = result.data as SourceLabels
  return Object.fromEntries(
    SOURCE_KEYS.flatMap((key) => {
      const label = checked[key]
      const fallback = DEFAULT_SOURCE_LABELS[key]
      return label.singular === fallback.singular && label.plural === fallback.plural ? [] : [[key, label]]
    })
  )
}

// Replaces the structured sources and their labels, creating the record on the first save. Throws a KnowledgeSettingsError
export async function updateStructuredSources(db: Queryable, input: StructuredSourcesInput) {
  const columns = {
    team_members_enabled: input.teamMembers,
    projects_enabled: input.projects,
    clients_enabled: input.clients,
    capabilities_enabled: input.capabilities,
    job_openings_enabled: input.jobOpenings,
    labels: changedLabels(input.labels),
  }
  await db
    .insert(knowledgeSettings)
    .values({ id: true, ...columns })
    .onConflictDoUpdate({ target: knowledgeSettings.id, set: { ...columns, updated_at: new Date() } })
  return readKnowledgeSources(db)
}
