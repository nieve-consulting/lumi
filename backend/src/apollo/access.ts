import type { ApolloServerPlugin } from "@apollo/server"
import {
  getArgumentValues,
  getVariableValues,
  GraphQLError,
  TypeInfo,
  visit,
  visitWithTypeInfo,
  type DocumentNode,
  type FragmentDefinitionNode,
  type GraphQLSchema,
  type OperationDefinitionNode,
} from "graphql"

import { objectFields } from "./schema/objectFields"
import { typeDefs } from "./schema/type-defs"
import type { Context } from "./types"

// What each API key role may do (src/authorizers/apiAccess.ts), checked once the operation is known and before anything runs,
// so a refused operation changes and returns nothing:
// - internal: everything
// - admin: everything but INTERNAL_ONLY, managing API keys and administrators
// - readOnly: queries of published records and public business data only, default-deny at every level. Root query fields
//   outside READ_ONLY_QUERIES, fields of any other type outside READ_ONLY_FIELDS (such as Client.internal_webpage, staff only),
//   any mutation and any field whose includeUnpublished argument is true, at any depth, are refused. Draft and outdated
//   translations are left out of their translations fields (publicTranslationsOnly in ./schema/index.ts)
// A new query or field is refused to read-only keys until it is deliberately added to READ_ONLY_QUERIES or READ_ONLY_FIELDS.
// Each generated key also has its own rate limit, which the transports count before Apollo sees the request (./apiKeyLimit.ts)

// The root query fields a read-only key may use: published records and public business data. __typename too
const READ_ONLY_QUERIES = new Set([
  "projects",
  "project",
  "projectBySlug",
  "teamMembers",
  "teamMember",
  "teamMemberBySlug",
  "publicTeamMember",
  "clients",
  "client",
  "clientBySlug",
  "jobOpenings",
  "jobOpening",
  "jobOpeningBySlug",
  "capabilities",
  "capability",
  "company",
  "publicBusinessSettings",
  "resumeSettings",
  "__typename",
])

// The fields a read-only key may select on each type the READ_ONLY_QUERIES return, at any depth: what is public about a
// published record or the business. __typename is always allowed. Left out on purpose: Client.internal_webpage, the
// staff's internal page about the client. Checked against the SDL when this module loads (checkReadOnlyFields)
const READ_ONLY_TYPE_FIELDS: Record<string, string[]> = {
  Project: [
    "id",
    "created_at",
    "updated_at",
    "start_date",
    "url_slug",
    "name",
    "location",
    "end_date",
    "webpage",
    "summary",
    "industry",
    "type",
    "image_key",
    "description",
    "published",
    "client",
    "teamMembers",
    "capabilities",
    "language",
    "fallback_fields",
    "translations",
  ],
  ProjectTranslation: ["name", "summary", "description", "industry", "type", "language", "updated_at", "outdated", "draft"],
  Client: [
    "id",
    "name",
    "summary",
    "url_slug",
    "client_website",
    "description",
    "logo_key",
    "published",
    "projects",
    "language",
    "fallback_fields",
    "translations",
  ],
  ClientTranslation: ["summary", "description", "language", "updated_at", "outdated", "draft"],
  TeamMember: [
    "id",
    "created_at",
    "updated_at",
    "name",
    "url_slug",
    "job_title",
    "bio",
    "webpage",
    "education",
    "capability_highlights",
    "profile_photo_key",
    "published",
    "capabilities",
    "project_contributions",
    "experiences",
    "language",
    "fallback_fields",
    "translations",
  ],
  TeamMemberTranslation: ["job_title", "capability_highlights", "bio", "education", "language", "updated_at", "outdated", "draft"],
  TeamMemberCapability: ["id", "name", "stars", "language", "fallback_fields"],
  TeamMemberInProject: ["teamMember", "description", "start_date", "end_date", "language", "fallback_fields", "translations"],
  ProjectContribution: ["project", "start_date", "description", "end_date", "language", "fallback_fields", "translations"],
  ProjectContributionTranslation: ["description", "language", "updated_at", "outdated", "draft"],
  Capability: ["id", "name", "description", "language", "fallback_fields", "translations"],
  CapabilityTranslation: ["name", "description", "language", "updated_at", "outdated", "draft"],
  Experience: [
    "id",
    "company",
    "position",
    "location",
    "description",
    "start_date",
    "logo_key",
    "end_date",
    "language",
    "fallback_fields",
    "translations",
  ],
  ExperienceTranslation: ["position", "description", "language", "updated_at", "outdated", "draft"],
  JobOpening: [
    "id",
    "created_at",
    "updated_at",
    "url_slug",
    "title",
    "summary",
    "description",
    "location",
    "work_mode",
    "application_url",
    "posted_at",
    "published",
    "language",
    "fallback_fields",
    "translations",
  ],
  JobOpeningTranslation: ["title", "summary", "description", "language", "updated_at", "outdated", "draft"],
  Company: ["location", "phone", "email", "founding_story", "values", "vision", "mission", "webpage", "language", "fallback_fields", "translations"],
  CompanyTranslation: ["founding_story", "values", "vision", "mission", "language", "updated_at", "outdated", "draft"],
  PublicBusinessSettings: [
    "businessName",
    "websiteUrl",
    "careersUrl",
    "contactUrl",
    "contactEmail",
    "contactPhone",
    "assistantName",
    "avatarUrl",
    "logoUrl",
    "primaryColor",
    "defaultLanguage",
    "starters",
    "greeting",
    "updatedAt",
  ],
  BusinessStarter: ["icon", "label", "message"],
  ResumeSettings: ["enabled", "logoUrl", "headerColor", "accentColor", "gradientColor", "footerText", "updatedAt"],
  LocalizedText: ["language", "text"],
  PublicTeamMemberProfile: [
    "id",
    "name",
    "job_title",
    "bio",
    "education",
    "capability_highlights",
    "webpage",
    "profile_photo_url",
    "experiences",
    "capabilities",
    "project_contributions",
    "language",
    "fallback_fields",
  ],
  PublicExperience: ["company", "position", "location", "start_date", "end_date", "description", "logo_url", "language", "fallback_fields"],
  PublicTeamMemberCapability: ["name", "stars", "language", "fallback_fields"],
  PublicProjectContribution: ["project", "description", "start_date", "end_date", "language", "fallback_fields"],
  PublicContributionProject: ["id", "name", "client", "language", "fallback_fields"],
  PublicClientReference: ["id", "name", "logo_url"],
}

const READ_ONLY_FIELDS = new Set(Object.entries(READ_ONLY_TYPE_FIELDS).flatMap(([type, fields]) => fields.map((field) => `${type}.${field}`)))

// Every allowed query and field must be in the SDL, so a rename fails at startup rather than silently refuse what read-only
// keys could read
function checkReadOnlyFields() {
  const types = objectFields(typeDefs)
  const missing = [...[...READ_ONLY_QUERIES].filter((name) => name !== "__typename").map((name) => `Query.${name}`), ...READ_ONLY_FIELDS].filter(
    (pair) => {
      const [type, field] = pair.split(".")
      return !types.get(type)?.has(field)
    }
  )
  if (missing.length) {
    throw new Error(
      `src/apollo/access.ts allows read-only API keys fields the schema doesn't have: ${missing.join(", ")}. Update READ_ONLY_QUERIES or READ_ONLY_TYPE_FIELDS`
    )
  }
}
checkReadOnlyFields()

// Root fields only the installation's own key may use: the admin interface manages API keys and administrators (and sets the
// installation up, with its first administrator), so an admin key can't give itself or anyone else lasting access
const INTERNAL_ONLY = new Set([
  "apiKeys",
  "createApiKey",
  "revokeApiKey",
  "adminAccounts",
  "adminAccount",
  "verifyAdminCredentials",
  "createAdminAccount",
  "deleteAdminAccount",
  "changeAdminPassword",
  "setupBusiness",
])

// Returned with HTTP status 403; the status itself is not in the response's errors
export const forbidden = (message: string) => new GraphQLError(message, { extensions: { code: "FORBIDDEN", http: { status: 403 } } })

// For the INTERNAL_ONLY resolvers, which check again in case the plugin's check changes
export function requireInternal(context: Context) {
  if (context.role !== "internal") throw forbidden("An API key can't manage API keys or administrators: only the admin interface can.")
}

// The operation and the fragments it uses, directly or through other fragments
function operationFragments(document: DocumentNode, operation: OperationDefinitionNode) {
  const fragments = new Map<string, FragmentDefinitionNode>()
  for (const definition of document.definitions) {
    if (definition.kind === "FragmentDefinition") fragments.set(definition.name.value, definition)
  }

  const used = new Map<string, FragmentDefinitionNode>()
  const collect = (node: OperationDefinitionNode | FragmentDefinitionNode) =>
    visit(node, {
      FragmentSpread(spread) {
        const name = spread.name.value
        const fragment = fragments.get(name)
        if (fragment && !used.has(name)) {
          used.set(name, fragment)
          collect(fragment)
        }
      },
    })
  collect(operation)
  return [...used.values()]
}

// The first field of the operation, or of a fragment it uses, the key's role may not use: its refusal, or null when there is none.
// Variables that fail to coerce return null: execution then fails on them before any resolver runs
export function accessViolation(
  schema: GraphQLSchema,
  document: DocumentNode,
  operation: OperationDefinitionNode,
  variables: Record<string, unknown> | undefined,
  role: Context["role"]
): GraphQLError | null {
  if (role === "internal") return null

  if (role === "readOnly" && operation.operation !== "query") {
    return forbidden(`A read-only API key can't run a ${operation.operation}. Use an admin API key.`)
  }

  let variableValues: Record<string, unknown> = {}
  if (role === "readOnly") {
    const coerced = getVariableValues(schema, operation.variableDefinitions ?? [], variables ?? {})
    if (coerced.errors) return null
    variableValues = coerced.coerced
  }

  const rootTypes = new Set([schema.getQueryType(), schema.getMutationType(), schema.getSubscriptionType()].map((type) => type?.name))
  let violation: GraphQLError | null = null

  for (const node of [operation, ...operationFragments(document, operation)]) {
    const typeInfo = new TypeInfo(schema)
    visit(
      node,
      visitWithTypeInfo(typeInfo, {
        Field(field) {
          if (violation) return
          const name = field.name.value
          const parentType = typeInfo.getParentType()
          const isRoot = !!parentType && rootTypes.has(parentType.name)

          if (role === "admin") {
            if (isRoot && INTERNAL_ONLY.has(name)) {
              violation = forbidden(`An API key can't use ${name}: only the admin interface can manage API keys and administrators.`)
            }
            return
          }

          if (isRoot && !READ_ONLY_QUERIES.has(name)) {
            violation = forbidden(`A read-only API key can't use ${name}: it only reads published records and public business data.`)
            return
          }
          if (!isRoot && name !== "__typename") {
            const pair = `${parentType?.name ?? "?"}.${name}`
            if (!READ_ONLY_FIELDS.has(pair)) {
              violation = forbidden(`A read-only API key can't select ${pair}: it only reads published records and public business data.`)
              return
            }
          }

          const fieldDef = typeInfo.getFieldDef()
          if (!fieldDef?.args.some((arg) => arg.name === "includeUnpublished")) return
          let includeUnpublished: unknown
          try {
            includeUnpublished = getArgumentValues(fieldDef, field, variableValues).includeUnpublished
          } catch {
            // An invalid argument fails validation before execution; refused all the same
            includeUnpublished = true
          }
          if (includeUnpublished === true) {
            violation = forbidden(`A read-only API key can't use includeUnpublished on ${name}: it only reads published records.`)
          }
        },
      })
    )
    if (violation) return violation
  }

  return null
}

// Refuses, with a FORBIDDEN error, an operation the request's key may not run
export const accessPlugin: ApolloServerPlugin<Context> = {
  async requestDidStart() {
    return {
      async didResolveOperation({ schema, document, operation, request, contextValue }) {
        // Apollo resolves the operation before this hook, or answers with an error itself
        if (!operation) {
          if (contextValue.role !== "internal") throw forbidden("The operation to run could not be determined.")
          return
        }
        const violation = accessViolation(schema, document, operation, request.variables, contextValue.role)
        if (violation) throw violation
      },
    }
  },
}
