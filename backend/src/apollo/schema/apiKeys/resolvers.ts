import { requireInternal } from "@/apollo/access"
import { ApiKeyAccess, type Resolvers } from "@/generated/graphql"
import { ApiKeyInputError, ApiKeyNotFoundError, createApiKey, listApiKeys, revokeApiKey, type ApiKeyRecord } from "@/services/apiKeys"
import { GraphQLError } from "graphql"

// The API keys admins generate for other systems (src/services/apiKeys.ts). Only the installation's own key may manage them:
// the web app's server, which checks admin access first. src/apollo/access.ts refuses them to generated keys too; checking
// here as well covers any change there. Secrets are never returned but for a new key's, once

const toAccess = { read_only: ApiKeyAccess.ReadOnly, admin: ApiKeyAccess.Admin } as const
const fromAccess = { [ApiKeyAccess.ReadOnly]: "read_only", [ApiKeyAccess.Admin]: "admin" } as const

export function toApiKey(record: ApiKeyRecord) {
  return {
    id: record.id,
    name: record.name,
    access: toAccess[record.access],
    lastCharacters: record.last_characters,
    createdAt: record.created_at.toISOString(),
    createdBy: record.created_by,
    lastUsedAt: record.last_used_at?.toISOString() ?? null,
  }
}

// The API key errors by their codes. Anything else is rethrown as is
function asApiKeyError(error: unknown): never {
  if (error instanceof ApiKeyInputError) throw new GraphQLError(error.message, { extensions: { code: "BAD_USER_INPUT", problems: error.problems } })
  if (error instanceof ApiKeyNotFoundError) throw new GraphQLError(error.message, { extensions: { code: "NOT_FOUND" } })
  throw error
}

export const apiKeysResolvers: Resolvers = {
  Query: {
    apiKeys: async (_, __, context) => {
      requireInternal(context)
      return (await listApiKeys(context.drizzle)).map(toApiKey)
    },
  },
  Mutation: {
    createApiKey: async (_, { input }, context) => {
      requireInternal(context)
      try {
        const { apiKey, secret } = await createApiKey(context.drizzle, {
          name: input.name,
          access: fromAccess[input.access],
          createdBy: input.createdBy,
        })
        return { apiKey: toApiKey(apiKey), secret }
      } catch (error) {
        asApiKeyError(error)
      }
    },
    revokeApiKey: async (_, { id }, context) => {
      requireInternal(context)
      try {
        await revokeApiKey(context.drizzle, id)
        return true
      } catch (error) {
        asApiKeyError(error)
      }
    },
  },
}
