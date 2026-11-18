import { capabilities, projectCapabilities, teamMemberCapabilities } from "@db/schema"
import { DEFAULT_LANGUAGE } from "@lumi/shared-contracts/language"
import { and, asc, count, eq, ilike, inArray, or } from "drizzle-orm"
import { z } from "zod"

import { requireTeam, type ServiceContext } from "./context"
import { concurrently, type Queryable } from "./db"
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
  allowDuplicateNameField,
  assertExists,
  assertNoSameName,
  definedFields,
  expectedVersionField,
  idSchema,
  iso,
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
import { assertUnique, longTextField, nameField, uuidField } from "./rules"
import { contentSql, loadContentOf, missingTranslation, saveContent, type ReadLanguage } from "./translations"
import { assertVersion, versionOf } from "./versions"
import { isPublicCapabilityIn, type CapabilityUsers } from "./visibility"

// Schemas

export const publicCapabilitySchema = z.object({ id: idSchema, name: z.string(), description: z.string().nullable(), ...localizedShape })

export const teamCapabilitySchema = publicCapabilitySchema.extend({
  translations: translationStatusSchema,
  is_public: z
    .boolean()
    .describe("Whether anonymous users can see the capability: true while a public project or team member uses it, of the sources that are on"),
  usage: z.object({ projects: z.number().int(), team_members: z.number().int() }),
  version: versionSchema,
  created_at: timestampSchema,
  updated_at: timestampSchema,
})

export type PublicCapability = z.infer<typeof publicCapabilitySchema>
export type TeamCapability = z.infer<typeof teamCapabilitySchema>

export const publicCapabilityPageSchema = pageSchema(publicCapabilitySchema)
export const teamCapabilityPageSchema = pageSchema(teamCapabilitySchema.omit({ usage: true }))

export const capabilityListInput = z.object(listInputShape)

export const capabilityFields = {
  name: nameField("Capability or technology name, e.g. TypeScript"),
  description: longTextField("What the capability covers"),
}

export const createCapabilityInput = z.object({
  name: capabilityFields.name,
  description: capabilityFields.description.optional(),
  translation: translationInput(capabilityFields),
  allow_duplicate_name: allowDuplicateNameField,
  idempotency_key: idempotencyKeyField,
})

export const updateCapabilityInput = z.object({
  id: uuidField("Capability id from admin_get_capabilities"),
  expected_version: expectedVersionField,
  language: writeLanguageField,
  patch: patchSchema({ name: requiredContentPatchField(capabilityFields.name), description: capabilityFields.description.nullable().optional() }),
  idempotency_key: idempotencyKeyField,
})

// Queries

// A capability's content is read from its translations with capabilityContent
const editableColumns = { id: capabilities.id }

// The capability's English name, for same-name checks and the capabilities other records list
export const capabilityName = contentSql("capability", "name")

// Covers the capability's content in every language, so saving any language changes it
const capabilityVersion = (id: string, content: RecordContent<"capability">) => versionOf({ content: content.version({ capability_id: id }) })

// Matches the content in the language, or in English where it is not translated
function searchCondition(query: string | undefined, language?: ReadLanguage) {
  if (!query) return undefined
  const pattern = containsPattern(query)
  return or(ilike(contentSql("capability", "name", language), pattern), ilike(contentSql("capability", "description", language), pattern))
}

// Translations of the capabilities, to read them in the language
const capabilityContent = (db: Queryable, ids: string[], language?: ReadLanguage) => loadContentOf(db, "capability", ids, language)

// The reads take the records whose use makes a capability public: both by default, only those of the sources that are on for
// the MCP server, so a capability only an off source uses isn't disclosed, nor counted as public
const ALL_USERS: CapabilityUsers = { projects: true, teamMembers: true }

export async function loadTeamCapability(db: Queryable, id: string, language?: ReadLanguage, usedBy = ALL_USERS): Promise<TeamCapability> {
  const [capability] = await db
    .select({ ...editableColumns, created_at: capabilities.created_at, updated_at: capabilities.updated_at, is_public: isPublicCapabilityIn(usedBy) })
    .from(capabilities)
    .where(eq(capabilities.id, id))
  if (!capability) throw notFound("capability", id)

  const [[projectUsage], [teamMemberUsage], content] = await concurrently(db, [
    () => db.select({ total: count() }).from(projectCapabilities).where(eq(projectCapabilities.capability_id, id)),
    () => db.select({ total: count() }).from(teamMemberCapabilities).where(eq(teamMemberCapabilities.capability_id, id)),
    () => capabilityContent(db, [id], language),
  ])
  const localized = content.localize(capability, { capability_id: id })

  return {
    id: capability.id,
    name: localized.name,
    description: localized.description,
    language: localized.language,
    fallback_fields: localized.fallback_fields,
    translations: translationStatus(content.translations({ capability_id: id })),
    is_public: capability.is_public,
    usage: { projects: projectUsage.total, team_members: teamMemberUsage.total },
    version: capabilityVersion(capability.id, content),
    created_at: iso(capability.created_at),
    updated_at: iso(capability.updated_at),
  }
}

// Capabilities linked in one call must exist and be distinct; field names the input they came from
export async function assertCapabilitiesExist(db: Queryable, capabilityIds: string[], field: string) {
  assertUnique(capabilityIds, field)
  if (capabilityIds.length) {
    assertExists(
      "capability",
      capabilityIds,
      await db.select({ id: capabilities.id }).from(capabilities).where(inArray(capabilities.id, capabilityIds))
    )
  }
}

// Public reads

export async function listPublicCapabilities(ctx: ServiceContext, input: ListInput, { language }: ListOptions = {}, usedBy = ALL_USERS) {
  const window = pageWindow(input, { query: input.query, language })
  const rows = await ctx.db
    .select(editableColumns)
    .from(capabilities)
    .where(and(isPublicCapabilityIn(usedBy), searchCondition(input.query, language)))
    .orderBy(asc(contentSql("capability", "name", language)), asc(capabilities.id))
    .limit(window.fetch)
    .offset(window.offset)
  const content = await capabilityContent(
    ctx.db,
    rows.map(({ id }) => id),
    language
  )

  return window.toPage<PublicCapability>(rows.map((capability) => content.localize(capability, { capability_id: capability.id })))
}

export async function getPublicCapability(
  ctx: ServiceContext,
  id: string,
  { language }: DetailOptions = {},
  usedBy = ALL_USERS
): Promise<PublicCapability> {
  const [capability] = await ctx.db
    .select(editableColumns)
    .from(capabilities)
    .where(and(eq(capabilities.id, id), isPublicCapabilityIn(usedBy)))
  if (!capability) throw notFound("capability", id)

  const content = await capabilityContent(ctx.db, [id], language)
  return content.localize(capability, { capability_id: id })
}

// Team reads

export async function listTeamCapabilities(
  ctx: ServiceContext,
  input: ListInput,
  { language, missingLanguage }: TeamListOptions = {},
  usedBy = ALL_USERS
) {
  requireTeam(ctx, "read")
  const window = pageWindow(input, { query: input.query, language, missing_language: missingLanguage })
  const rows = await ctx.db
    .select({ ...editableColumns, created_at: capabilities.created_at, updated_at: capabilities.updated_at, is_public: isPublicCapabilityIn(usedBy) })
    .from(capabilities)
    .where(and(searchCondition(input.query, language), missingLanguage ? missingTranslation("capability", missingLanguage) : undefined))
    .orderBy(asc(contentSql("capability", "name", language)), asc(capabilities.id))
    .limit(window.fetch)
    .offset(window.offset)
  const content = await capabilityContent(
    ctx.db,
    rows.map(({ id }) => id),
    language
  )

  return window.toPage(
    rows.map((capability) => ({
      ...content.localize(capability, { capability_id: capability.id }),
      translations: translationStatus(content.translations({ capability_id: capability.id })),
      version: capabilityVersion(capability.id, content),
      created_at: iso(capability.created_at),
      updated_at: iso(capability.updated_at),
    }))
  )
}

export async function getTeamCapability(ctx: ServiceContext, id: string, { language }: DetailOptions = {}, usedBy = ALL_USERS) {
  requireTeam(ctx, "read")
  return loadTeamCapability(ctx.db, id, language, usedBy)
}

// Team writes

export async function createCapability(ctx: ServiceContext, { idempotency_key, ...payload }: z.infer<typeof createCapabilityInput>) {
  return runMutation(ctx, { operation: "create_capability", idempotencyKey: idempotency_key, payload, recordType: "capability" }, async (tx) => {
    // The translation's name is checked against the names in its language too, falling back to English
    const { translation } = payload
    const sameName = await tx
      .select({ id: capabilities.id, name: capabilityName })
      .from(capabilities)
      .where(
        or(
          sameNameCondition(capabilityName, payload.name),
          translation?.name ? sameNameCondition(contentSql("capability", "name", translation.language), translation.name) : undefined
        )
      )
    assertNoSameName("capability", sameName, payload.allow_duplicate_name)

    // Every field of a capability is content, which its English translation holds
    const [{ id }] = await tx
      .insert(capabilities)
      .values({})
      .returning({ id: capabilities.id })
      .catch((error) => mapDbError(error, "capability"))
    await saveContent(tx, "capability", { capability_id: id }, DEFAULT_LANGUAGE, { name: payload.name, description: payload.description })
    await saveTranslation(tx, "capability", { capability_id: id }, payload.translation)

    return loadTeamCapability(tx, id)
  })
}

export async function updateCapability(
  ctx: ServiceContext,
  { idempotency_key, ...payload }: z.infer<typeof updateCapabilityInput>,
  usedBy = ALL_USERS
) {
  return runMutation(
    ctx,
    { operation: "update_capability", idempotencyKey: idempotency_key, payload, recordType: "capability", recordId: payload.id },
    async (tx) => {
      const [current] = await tx.select(editableColumns).from(capabilities).where(eq(capabilities.id, payload.id)).for("update")
      if (!current) throw notFound("capability", payload.id)
      assertVersion(payload.expected_version, capabilityVersion(current.id, await capabilityContent(tx, [current.id])), "capability")

      const language = payload.language ?? DEFAULT_LANGUAGE
      await saveContent(tx, "capability", { capability_id: payload.id }, language, definedFields(payload.patch), { replaceDraft: true }).catch(
        (error) => mapDbError(error, "capability")
      )
      await tx.update(capabilities).set({ updated_at: new Date() }).where(eq(capabilities.id, payload.id))

      return loadTeamCapability(tx, payload.id, language, usedBy)
    }
  )
}
