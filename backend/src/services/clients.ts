import { clients, projects } from "@db/schema"
import { DEFAULT_LANGUAGE } from "@lumi/shared-contracts/language"
import { and, asc, count, desc, eq, ilike, or } from "drizzle-orm"
import { z } from "zod"

import { requireTeam, type ServiceContext } from "./context"
import { concurrently, type Queryable } from "./db"
import { mapDbError, notFound } from "./errors"
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
  type ListInput,
  type ListOptions,
  type TeamListOptions,
} from "./pagination"
import {
  allowDuplicateNameField,
  assertNoSameName,
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
  sameNameCondition,
  saveTranslation,
  timestampSchema,
  translationInput,
  translationStatus,
  translationStatusSchema,
  versionSchema,
  writeLanguageField,
  type RecordContent,
} from "./records"
import { longTextField, nameField, slugField, urlField, uuidField } from "./rules"
import { contentSql, loadContentOf, missingTranslation, saveContent, splitContent, type ReadLanguage } from "./translations"
import { assertVersion, versionOf } from "./versions"
import { isPublicClient, isPublicProject } from "./visibility"

// Clients are the customers the business works for

// Schemas

export const publicClientSummarySchema = z.object({
  id: idSchema,
  name: z.string(),
  url_slug: z.string(),
  summary: z.string(),
  client_website: z.string().nullable(),
  logo_url: z.string().nullable(),
  ...localizedShape,
})

const clientProjectSchema = z.object({ id: idSchema, name: z.string(), summary: z.string().nullable(), ...localizedShape })

export const publicClientSchema = publicClientSummarySchema.extend({
  description: z.string().nullable(),
  projects: nestedSchema(clientProjectSchema).describe("Public projects for this client"),
})

const teamClientFields = {
  internal_webpage: z.string().nullable().describe("Internal page about the client; staff only"),
  published: z.boolean().describe("Approved for external disclosure; changed with publish_record and unpublish_record"),
  translations: translationStatusSchema,
  version: versionSchema,
  created_at: timestampSchema,
  updated_at: timestampSchema,
}

export const teamClientSummarySchema = publicClientSummarySchema.extend(teamClientFields)

export const teamClientSchema = publicClientSchema.extend({
  ...teamClientFields,
  projects: nestedSchema(clientProjectSchema.extend({ published: z.boolean() })).describe("Every project for this client"),
})

export type PublicClientSummary = z.infer<typeof publicClientSummarySchema>
export type PublicClient = z.infer<typeof publicClientSchema>
export type TeamClient = z.infer<typeof teamClientSchema>

export const publicClientPageSchema = pageSchema(publicClientSummarySchema)
export const teamClientPageSchema = pageSchema(teamClientSummarySchema)

export const clientListInput = z.object(listInputShape)

const clientFields = {
  name: nameField("Client (customer) name"),
  summary: z.string().trim().min(1, "Must not be empty").max(2000).describe("One or two sentences about the client"),
  url_slug: slugField,
  description: longTextField("Longer description of the client (markdown)"),
  client_website: urlField("The client's own website"),
  internal_webpage: urlField("Internal page about the client; never shown publicly"),
}

export const createClientInput = z.object({
  name: clientFields.name,
  summary: clientFields.summary,
  url_slug: clientFields.url_slug,
  description: clientFields.description.optional(),
  client_website: clientFields.client_website.optional(),
  internal_webpage: clientFields.internal_webpage.optional(),
  translation: translationInput({ summary: clientFields.summary, description: clientFields.description }),
  allow_duplicate_name: allowDuplicateNameField,
  idempotency_key: idempotencyKeyField,
})

export const updateClientInput = z.object({
  id: uuidField("Client id from admin_get_clients"),
  expected_version: expectedVersionField,
  language: writeLanguageField,
  patch: patchSchema({
    name: clientFields.name.optional(),
    summary: requiredContentPatchField(clientFields.summary),
    url_slug: clientFields.url_slug.optional(),
    description: clientFields.description.nullable().optional(),
    client_website: clientFields.client_website.nullable().optional(),
    internal_webpage: clientFields.internal_webpage.nullable().optional(),
  }),
  idempotency_key: idempotencyKeyField,
})

// Queries

// A client's content is read from its translations with clientContent
type ClientRow = typeof clients.$inferSelect

// Covers the client's content in every language, so saving any language changes it
const clientVersion = (client: ClientRow, content: string) =>
  versionOf({
    name: client.name,
    url_slug: client.url_slug,
    client_website: client.client_website,
    internal_webpage: client.internal_webpage,
    published: client.published,
    content,
  })

type ClientContent = RecordContent<"client">

// Translations of the clients, to read them in the language
const clientContent = (db: Queryable, ids: string[], language?: ReadLanguage) => loadContentOf(db, "client", ids, language)

// The client's content in the content's language
const localizeClient = (client: ClientRow, content: ClientContent) => content.localize(client, { client_id: client.id })

// Content fields a client summary returns; the details return them all
const summaryContent = ["summary"]

function toPublicSummary(client: ReturnType<typeof localizeClient>, { detail = false } = {}): PublicClientSummary {
  return {
    id: client.id,
    name: client.name,
    url_slug: client.url_slug,
    summary: client.summary,
    client_website: client.client_website,
    logo_url: mediaUrl(client.logo_key, { w: 120, h: 120 }),
    ...localizedAs(client, detail ? undefined : summaryContent),
  }
}

function toTeamSummary(client: ClientRow, content: ClientContent, { detail = false } = {}) {
  return {
    ...toPublicSummary(localizeClient(client, content), { detail }),
    internal_webpage: client.internal_webpage,
    published: client.published,
    translations: translationStatus(content.translations({ client_id: client.id })),
    version: clientVersion(client, content.version({ client_id: client.id })),
    created_at: iso(client.created_at),
    updated_at: iso(client.updated_at),
  }
}

// Matches the content in the language, or in English where it is not translated
function searchCondition(query: string | undefined, language?: ReadLanguage) {
  if (!query) return undefined
  const pattern = containsPattern(query)
  return or(ilike(clients.name, pattern), ilike(contentSql("client", "summary", language), pattern))
}

async function clientProjects(db: Queryable, clientId: string, onlyPublic: boolean, limit = NESTED_LIMIT, language?: ReadLanguage) {
  const where = and(eq(projects.client_id, clientId), onlyPublic ? isPublicProject : undefined)
  const order = [desc(projects.start_date), asc(projects.id)]
  // The projects on the page, whose translations alone are loaded
  const pageIds = db
    .select({ id: projects.id })
    .from(projects)
    .where(where)
    .orderBy(...order)
    .limit(limit)
  const [rows, [{ total }], content] = await concurrently(db, [
    () =>
      db
        .select({ id: projects.id, published: projects.published })
        .from(projects)
        .where(where)
        .orderBy(...order)
        .limit(limit),
    () => db.select({ total: count() }).from(projects).where(where),
    () => loadContentOf(db, "project", pageIds, language),
  ])

  return {
    rows: rows.map((project) => {
      const localized = content.localize(project, { project_id: project.id })
      return {
        id: project.id,
        name: localized.name,
        summary: localized.summary,
        ...localizedAs(localized, ["name", "summary"]),
        published: project.published,
      }
    }),
    total,
  }
}

export async function loadTeamClient(db: Queryable, id: string, language?: ReadLanguage): Promise<TeamClient> {
  const [client] = await db.select().from(clients).where(eq(clients.id, id))
  if (!client) throw notFound("client", id)

  const [{ rows, total }, content] = await concurrently(db, [
    () => clientProjects(db, id, false, NESTED_LIMIT, language),
    () => clientContent(db, [id], language),
  ])

  return {
    ...toTeamSummary(client, content, { detail: true }),
    description: localizeClient(client, content).description,
    projects: nested(rows, total),
  }
}

// Public reads

export async function listPublicClients(ctx: ServiceContext, input: ListInput, { language }: ListOptions = {}) {
  const window = pageWindow(input, { query: input.query, language })
  const rows = await ctx.db
    .select()
    .from(clients)
    .where(and(isPublicClient, searchCondition(input.query, language)))
    .orderBy(asc(clients.name), asc(clients.id))
    .limit(window.fetch)
    .offset(window.offset)
  const content = await clientContent(
    ctx.db,
    rows.map(({ id }) => id),
    language
  )

  return window.toPage(rows.map((client) => toPublicSummary(localizeClient(client, content))))
}

// The logo key is returned for Lumi's chat card, which renders it through the media route; MCP returns only the record
export async function getPublicClient(
  ctx: ServiceContext,
  id: string,
  { nestedLimit = NESTED_LIMIT, language }: DetailOptions = {}
): Promise<{ record: PublicClient; media: { logoKey: string | null } }> {
  const [client] = await ctx.db
    .select()
    .from(clients)
    .where(and(eq(clients.id, id), isPublicClient))
  if (!client) throw notFound("client", id)

  const [{ rows, total }, content] = await concurrently(ctx.db, [
    () => clientProjects(ctx.db, id, true, nestedLimit, language),
    () => clientContent(ctx.db, [id], language),
  ])
  const localized = localizeClient(client, content)

  return {
    record: {
      ...toPublicSummary(localized, { detail: true }),
      description: localized.description,
      projects: nested(
        rows.map(({ id, name, summary, language, fallback_fields }) => ({ id, name, summary, language, fallback_fields })),
        total,
        nestedLimit
      ),
    },
    media: { logoKey: client.logo_key },
  }
}

// Team reads

export async function listTeamClients(ctx: ServiceContext, input: ListInput, { language, missingLanguage }: TeamListOptions = {}) {
  requireTeam(ctx, "read")
  const window = pageWindow(input, { query: input.query, language, missing_language: missingLanguage })
  const rows = await ctx.db
    .select()
    .from(clients)
    .where(and(searchCondition(input.query, language), missingLanguage ? missingTranslation("client", missingLanguage) : undefined))
    .orderBy(asc(clients.name), asc(clients.id))
    .limit(window.fetch)
    .offset(window.offset)
  const content = await clientContent(
    ctx.db,
    rows.map(({ id }) => id),
    language
  )

  return window.toPage(rows.map((client) => toTeamSummary(client, content)))
}

export async function getTeamClient(ctx: ServiceContext, id: string, { language }: DetailOptions = {}) {
  requireTeam(ctx, "read")
  return loadTeamClient(ctx.db, id, language)
}

// Team writes

export async function createClient(ctx: ServiceContext, { idempotency_key, ...payload }: z.infer<typeof createClientInput>) {
  return runMutation(ctx, { operation: "create_client", idempotencyKey: idempotency_key, payload, recordType: "client" }, async (tx) => {
    const sameName = await tx.select({ id: clients.id, name: clients.name }).from(clients).where(sameNameCondition(clients.name, payload.name))
    assertNoSameName("client", sameName, payload.allow_duplicate_name)
    await assertSlugFree(tx, "client", clients, clients.name, payload.url_slug)

    const [{ id }] = await tx
      .insert(clients)
      .values({
        name: payload.name,
        url_slug: payload.url_slug,
        client_website: payload.client_website,
        internal_webpage: payload.internal_webpage,
      })
      .returning({ id: clients.id })
      .catch((error) => mapDbError(error, "client"))
    await saveContent(tx, "client", { client_id: id }, DEFAULT_LANGUAGE, { summary: payload.summary, description: payload.description })
    await saveTranslation(tx, "client", { client_id: id }, payload.translation)

    return loadTeamClient(tx, id)
  })
}

export async function updateClient(ctx: ServiceContext, { idempotency_key, ...payload }: z.infer<typeof updateClientInput>) {
  return runMutation(
    ctx,
    { operation: "update_client", idempotencyKey: idempotency_key, payload, recordType: "client", recordId: payload.id },
    async (tx) => {
      assertTranslatablePatch("client", payload.language, payload.patch)
      const [current] = await tx.select().from(clients).where(eq(clients.id, payload.id)).for("update")
      if (!current) throw notFound("client", payload.id)
      const content = await clientContent(tx, [payload.id])
      assertVersion(payload.expected_version, clientVersion(current, content.version({ client_id: payload.id })), "client")
      if (payload.patch.url_slug) await assertSlugFree(tx, "client", clients, clients.name, payload.patch.url_slug, payload.id)

      const { shared, content: values } = splitContent("client", definedFields(payload.patch))
      const language = payload.language ?? DEFAULT_LANGUAGE
      // Also moves updated_at when only the content changes
      await tx
        .update(clients)
        .set({ ...shared, updated_at: new Date() })
        .where(eq(clients.id, payload.id))
        .catch((error) => mapDbError(error, "client"))
      await saveContent(tx, "client", { client_id: payload.id }, language, values, { replaceDraft: true })

      return loadTeamClient(tx, payload.id, language)
    }
  )
}
