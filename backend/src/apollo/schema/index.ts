import type { Context } from "@/apollo/types"
import type { Resolvers } from "@/generated/graphql"
import { mergeResolvers } from "@graphql-tools/merge"
import { defaultFieldResolver, type GraphQLFieldResolver, type TypeNode } from "graphql"

import { adminAccountsResolvers } from "./adminAccounts/resolvers"
import { adminUsageResolvers } from "./adminUsage/resolvers"
import { apiKeysResolvers } from "./apiKeys/resolvers"
import { appointmentsResolvers } from "./appointments/resolvers"
import { businessResolvers } from "./business/resolvers"
import { capabilityResolvers } from "./capabilities/resolvers"
import { clientResolvers } from "./clients/resolvers"
import { companyResolvers } from "./company/resolvers"
import { dashboardResolvers } from "./dashboard/resolvers"
import { experienceResolvers } from "./experience/resolvers"
import { handoffResolvers } from "./handoff/resolvers"
import { installationResolvers } from "./installation/resolvers"
import { jobOpeningResolvers } from "./jobOpenings/resolvers"
import { knowledgeResolvers } from "./knowledge/resolvers"
import { objectFields } from "./objectFields"
import { projectsResolvers } from "./projects/resolvers"
import { resumeResolvers } from "./resume/resolvers"
import { teamMemberResolvers } from "./teamMembers/resolvers"
import { threadsResolvers } from "./threads/resolvers"
import { translationDraftsResolvers } from "./translationDrafts/resolvers"
import { typeDefs } from "./type-defs"
import { uploadsResolvers } from "./uploads/resolvers"
import { websiteResolvers } from "./websites/resolvers"

export { typeDefs }

const merged = mergeResolvers([
  teamMemberResolvers,
  projectsResolvers,
  clientResolvers,
  experienceResolvers,
  capabilityResolvers,
  uploadsResolvers,
  companyResolvers,
  threadsResolvers,
  websiteResolvers,
  appointmentsResolvers,
  dashboardResolvers,
  translationDraftsResolvers,
  adminUsageResolvers,
  businessResolvers,
  adminAccountsResolvers,
  handoffResolvers,
  knowledgeResolvers,
  jobOpeningResolvers,
  apiKeysResolvers,
  resumeResolvers,
  installationResolvers,
])

type FieldResolvers = Record<string, GraphQLFieldResolver<unknown, Context> | undefined>

type TranslationFlags = { draft?: unknown; outdated?: unknown } | null

// The named type a field's type wraps, e.g. CapabilityTranslation for [CapabilityTranslation!]!
const namedType = (type: TypeNode): string => (type.kind === "NamedType" ? type.name.value : namedType(type.type))

// Read-only API keys see translations as public reads do (src/apollo/access.ts): every translations field whose items have a
// draft flag leaves out AI drafts awaiting review and outdated translations, which public reads skip for English so no one
// sees facts corrected since (schema/jobOpenings/resolvers.ts), whatever type it is on, so one added later is covered too.
// Other roles get every translation, as before
function publicTranslationsOnly(resolvers: Resolvers): Resolvers {
  const types = objectFields(typeDefs)
  const result = { ...resolvers } as Record<string, unknown>

  for (const [typeName, fields] of types) {
    const field = fields.get("translations")
    if (!field || !types.get(namedType(field.type))?.has("draft")) continue

    const typeResolvers = { ...(result[typeName] as FieldResolvers | undefined) }
    const resolve = typeResolvers.translations ?? defaultFieldResolver
    typeResolvers.translations = (parent, args, context, info) => {
      if (context.role !== "readOnly") return resolve(parent, args, context, info)
      return Promise.resolve(resolve(parent, args, context, info)).then((translations: unknown) =>
        Array.isArray(translations)
          ? translations.filter((translation: TranslationFlags) => !translation?.draft && !translation?.outdated)
          : translations
      )
    }
    result[typeName] = typeResolvers
  }

  return result as Resolvers
}

export const resolvers = publicTranslationsOnly(merged)
