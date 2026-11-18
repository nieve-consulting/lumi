import { Resolvers, TranslatedRecordType, type TranslationDraftInput } from "@/generated/graphql"
import { invalidInput } from "@/services/errors"
import { uuidField } from "@/services/rules"
import { contentKeys, keyOf, type TranslatedRecord, type TranslationDraft } from "@/services/translations"
import { DEFAULT_LANGUAGE } from "@lumi/shared-contracts/language"
import { GraphQLError } from "graphql"

import { asGraphQLError, checkAdminInput, parseLanguage } from "../validation"

// Drafts saved in one call, as the admin translates records in batches
const MAX_DRAFTS = 100

const recordTypes = {
  [TranslatedRecordType.Client]: "client",
  [TranslatedRecordType.TeamMember]: "teamMember",
  [TranslatedRecordType.Experience]: "experience",
  [TranslatedRecordType.Project]: "project",
  [TranslatedRecordType.ProjectTeamMember]: "projectTeamMember",
  [TranslatedRecordType.Capability]: "capability",
  [TranslatedRecordType.JobOpening]: "jobOpening",
} as const satisfies Record<TranslatedRecordType, TranslatedRecord>

// The draft an input saves, rejecting fields its record type does not translate. Text too long for its field is left
// untranslated when saving (saveDraft)
function toDraft({ type, id, team_member_id, fields }: TranslationDraftInput, index: number): TranslationDraft {
  const record = recordTypes[type]
  const at = `drafts[${index}]`
  checkAdminInput(uuidField("Record id"), id)
  if (record === "projectTeamMember") {
    if (!team_member_id) throw invalidInput(`${at}.team_member_id is required for ${type}.`)
    checkAdminInput(uuidField("Team member id"), team_member_id)
  } else if (team_member_id) {
    throw invalidInput(`${at}.team_member_id is only for ${TranslatedRecordType.ProjectTeamMember}.`)
  }

  const translated = contentKeys(record)
  const content: Record<string, string> = {}
  const source: Record<string, string> = {}
  for (const { field, text, source: english } of fields) {
    if (!translated.includes(field)) throw invalidInput(`${at}: ${type} has no translated field ${field}, expected one of ${translated.join(", ")}.`)
    if (field in content) throw invalidInput(`${at}: field ${field} is given more than once.`)
    content[field] = text
    source[field] = english
  }

  const key = record === "projectTeamMember" ? { project_id: id, team_member_id } : keyOf(record, id)
  return { record, key, content, source }
}

export const translationDraftsResolvers: Resolvers = {
  Mutation: {
    saveTranslationDrafts: async (_, { language, drafts, replaceOutdated }, context) => {
      const inLanguage = parseLanguage(language)
      if (inLanguage === DEFAULT_LANGUAGE) {
        throw new GraphQLError("Drafts are translations of English, so they can't be saved in English", { extensions: { code: "BAD_USER_INPUT" } })
      }
      if (drafts.length > MAX_DRAFTS) {
        throw new GraphQLError(`At most ${MAX_DRAFTS} drafts can be saved at once`, { extensions: { code: "BAD_USER_INPUT" } })
      }

      try {
        return await context.dataSources.db.saveTranslationDrafts(inLanguage, drafts.map(toDraft), { replaceOutdated: replaceOutdated ?? false })
      } catch (error) {
        asGraphQLError(error)
      }
    },
  },
}
