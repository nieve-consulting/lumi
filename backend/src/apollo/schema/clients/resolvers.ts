import type { Context } from "@/apollo/types"
import { Resolvers } from "@/generated/graphql"
import { currentContent, type LocalizedContent, type RecordTranslation } from "@/services/translations"
import type { clients } from "@db/schema"
import type { Language } from "@lumi/shared-contracts/language"
import { GraphQLError } from "graphql"

import { translationsForGraphQL } from "../translations"
import { deleteUploadedFile } from "../uploads/deleteUploadedFile"
import { checkAdmin, parseLanguage, parseOptionalLanguage } from "../validation"

type LocalizedClient = typeof clients.$inferSelect &
  LocalizedContent<"client"> & { language: Language; fallback_fields: string[]; translations: RecordTranslation<"client">[] }

// A client read in a language, whose projects are read in the requested one
function toClient(client: LocalizedClient, requested_language: Language) {
  return {
    ...client,
    created_at: client.created_at.toISOString(),
    translations: translationsForGraphQL(client.translations),
    requested_language,
  }
}

async function getClients(context: Context, language: Language, missingLanguage: Language | undefined, includeUnpublished: boolean) {
  const clients = await context.dataSources.db.getClients(missingLanguage, includeUnpublished)
  return (await context.dataSources.db.localize("client", clients, currentContent(language))).map((client) => toClient(client, language))
}

// An unpublished client is not found unless includeUnpublished, like a missing id
async function getClient(id: string, context: Context, language: Language, includeUnpublished: boolean) {
  const client = await context.dataSources.db.getClientById(id)
  if (!client || (!includeUnpublished && !client.published)) {
    throw new GraphQLError("Client not found")
  }

  const [localized] = await context.dataSources.db.localize("client", [client], currentContent(language))
  return toClient(localized, language)
}

async function getClientBySlug(slug: string, context: Context, language: Language, includeUnpublished: boolean) {
  const client = await context.dataSources.db.getClientBySlug(slug)
  if (!client || (!includeUnpublished && !client.published)) {
    throw new GraphQLError("Client not found")
  }

  const [localized] = await context.dataSources.db.localize("client", [client], currentContent(language))
  return toClient(localized, language)
}

async function deleteClient(id: string, context: Context) {
  const client = await context.dataSources.db.getClientById(id)
  if (!client) {
    throw new GraphQLError("Client not found")
  }

  // The old image goes only once the record no longer uses it
  if (!(await context.dataSources.db.deleteClient(id))) return false
  if (client.logo_key) {
    await deleteUploadedFile(context, client.logo_key)
  }
  return true
}

async function linkUploadToClientLogo(clientId: string, key: string, context: Context) {
  const client = await context.dataSources.db.getClientById(clientId)
  if (!client) {
    throw new GraphQLError("Client not found")
  }

  // The old image goes only once the record no longer uses it
  if (!(await context.dataSources.db.linkUploadToClientLogo(key, clientId))) return false
  if (client.logo_key) {
    await deleteUploadedFile(context, client.logo_key)
  }
  return true
}

export const clientResolvers: Resolvers = {
  Query: {
    clients: async (_, { language, missingLanguage, includeUnpublished }, context) =>
      getClients(context, parseLanguage(language), parseOptionalLanguage(missingLanguage), includeUnpublished ?? false),
    client: async (_, { id, language, includeUnpublished }, context) => getClient(id, context, parseLanguage(language), includeUnpublished ?? false),
    clientBySlug: async (_, { url_slug, language, includeUnpublished }, context) =>
      getClientBySlug(url_slug, context, parseLanguage(language), includeUnpublished ?? false),
  },
  Project: {
    // Null rather than not found for an unpublished client, so its project still reads
    client: async (project, { includeUnpublished }, context) => {
      if (!project.client_id) return null
      const client = await context.dataSources.db.getClientById(project.client_id)
      if (!client || (!includeUnpublished && !client.published)) return null
      const [localized] = await context.dataSources.db.localize("client", [client], currentContent(project.requested_language))
      return toClient(localized, project.requested_language)
    },
  },
  Mutation: {
    createClient: async (_, { input }, context) => {
      checkAdmin.client(input)
      const result = await context.dataSources.db.createClient(input)
      return result.id
    },
    updateClient: async (_, { id, input, language }, context) => {
      const inLanguage = parseLanguage(language)
      checkAdmin.client(input, inLanguage)
      return context.dataSources.db.updateClient(id, input, inLanguage)
    },
    deleteClient: async (_, { id }, context) => deleteClient(id, context),
    linkUploadToClientLogo: async (_, { key, clientId }, context) => linkUploadToClientLogo(clientId, key, context),
  },
}
