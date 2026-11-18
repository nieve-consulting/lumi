import { clients, jobOpenings, projects, teamMembers } from "@db/schema"
import { eq } from "drizzle-orm"
import { z } from "zod"

import { loadTeamClient } from "./clients"
import type { ServiceContext } from "./context"
import type { Queryable } from "./db"
import { notFound } from "./errors"
import { loadTeamJobOpening } from "./jobOpenings"
import { idempotencyKeyField, runMutation } from "./mutations"
import { loadTeamProject } from "./projects"
import { expectedVersionField, idSchema, timestampSchema, versionSchema } from "./records"
import { uuidField } from "./rules"
import { loadTeamTeamMember } from "./teamMembers"
import { assertVersion } from "./versions"

// Publishing approves a project, client, team member or job opening for external disclosure: Lumi's website chatbot, the
// public GraphQL queries and anonymous MCP calls see it from then on (visibility.ts). Unpublishing hides it again everywhere
// public. Related records keep their own flag

export const publishableRecordTypes = ["project", "client", "team_member", "job_opening"] as const
export type PublishableRecordType = (typeof publishableRecordTypes)[number]

// Each record type's table, loader and name in messages. A job opening is named by its title
const publishable = {
  project: { table: projects, load: loadTeamProject, label: "project" },
  client: { table: clients, load: loadTeamClient, label: "client" },
  team_member: { table: teamMembers, load: loadTeamTeamMember, label: "team member" },
  job_opening: {
    table: jobOpenings,
    load: async (db: Queryable, id: string) => {
      const jobOpening = await loadTeamJobOpening(db, id)
      return { ...jobOpening, name: jobOpening.title }
    },
    label: "job opening",
  },
}

// Schemas

export const publicationSchema = z.object({
  id: idSchema,
  name: z.string().describe("The record's name, or a job opening's title"),
  published: z.boolean().describe("Whether the record is now approved for external disclosure"),
  version: versionSchema,
  updated_at: timestampSchema,
})

const recordTypeField = z.enum(publishableRecordTypes).describe("Type of the record: project, client (customer), team_member or job_opening")
const recordIdField = uuidField("Record id from admin_get_projects, admin_get_clients, admin_get_team_members or admin_get_job_openings")

export const publishRecordInput = z.object({
  record_type: recordTypeField,
  id: recordIdField,
  expected_version: expectedVersionField.describe(
    "version from the admin_ read the user reviewed. Publishing is rejected with a conflict if the record changed since, so only reviewed content is disclosed"
  ),
  idempotency_key: idempotencyKeyField,
})

export const unpublishRecordInput = z.object({
  record_type: recordTypeField,
  id: recordIdField,
  idempotency_key: idempotencyKeyField,
})

// Team writes

async function setPublished(
  ctx: ServiceContext,
  operation: string,
  { record_type, id, expected_version }: { record_type: PublishableRecordType; id: string; expected_version?: string },
  published: boolean,
  idempotencyKey: string
) {
  const { table, load, label } = publishable[record_type]

  return runMutation(
    ctx,
    { operation, idempotencyKey, payload: { record_type, id, expected_version }, recordType: record_type, recordId: id },
    async (tx) => {
      const [locked] = await tx.select({ id: table.id }).from(table).where(eq(table.id, id)).for("update")
      if (!locked) throw notFound(label, id)

      const current = await load(tx, id)
      if (expected_version !== undefined) assertVersion(expected_version, current.version, label)

      // Already in the requested state: nothing to write
      if (current.published === published) return toPublication(current)

      await tx.update(table).set({ published }).where(eq(table.id, id))
      return toPublication(await load(tx, id))
    }
  )
}

function toPublication(record: z.infer<typeof publicationSchema>) {
  return { id: record.id, name: record.name, published: record.published, version: record.version, updated_at: record.updated_at }
}

export async function publishRecord(ctx: ServiceContext, { idempotency_key, ...payload }: z.infer<typeof publishRecordInput>) {
  return setPublished(ctx, "publish_record", payload, true, idempotency_key)
}

export async function unpublishRecord(ctx: ServiceContext, { idempotency_key, ...payload }: z.infer<typeof unpublishRecordInput>) {
  return setPublished(ctx, "unpublish_record", payload, false, idempotency_key)
}
