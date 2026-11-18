import {
  TranslatedRecordType,
  type Capability,
  type Client,
  type JobOpening,
  type Mutation,
  type MutationSaveTranslationDraftsArgs,
  type Project,
  type Query,
  type TeamMember,
  type TranslationDraftInput,
} from "@/generated/graphql"
import { gql } from "@apollo/client"
import { CombinedGraphQLErrors } from "@apollo/client/errors"
import { DEFAULT_LANGUAGE, LANGUAGES, type Language } from "@lumi/shared-contracts/language"
import { z } from "zod"

import { getAdminClient } from "@/lib/adminApiClient"
import { adminRouteAccess } from "@/lib/auth/admin"
import { showsSource } from "@/lib/knowledgeSources"
import { fieldBatches, translateFields, translateRequestError, translateRequestSchema, type TranslateRequest } from "@/lib/translation"
import { TRANSLATION_FAILED } from "@/lib/translationMessages"
import { capabilityFieldDescriptions, capabilityRecordKind } from "@/app/admin/capabilities/components/form/schema"
import { clientFieldDescriptions, clientRecordKind } from "@/app/admin/clients/components/form/schema"
import { getKnowledgeSources } from "@/app/admin/components/getKnowledgeSources"
import {
  BULK_TRANSLATE_MODES,
  bulkTranslates,
  findTranslation,
  type BulkTranslateMode,
  type FieldDescription,
  type TranslationStatusLike,
} from "@/app/admin/components/translations/languages"
import { jobOpeningFieldDescriptions, jobOpeningRecordKind } from "@/app/admin/job-openings/components/form/schema"
import {
  contributionFieldDescriptions,
  contributionHasEnglish,
  projectFieldDescriptions,
  projectRecordKind,
} from "@/app/admin/projects/components/form/schema"
import { experienceFieldDescriptions, teamMemberFieldDescriptions, teamMemberRecordKind } from "@/app/admin/team-members/components/form/schema"

// Translates what a record is missing in a language, or also what's outdated there, with AI and saves it as drafts for the
// team to review, for the records lists' bulk translation, which calls it once per record: the record's own content when
// it has no translation in the language, and each nested item (a team member's experiences, a project's contributions) with
// English text and no translation in it. In "missing_or_outdated" mode it also re-translates those whose translation is
// outdated, reviewed or an AI draft, sending its text along so the model keeps the reviewed wording where it still matches
// English, and the new draft takes its place. Everything is translated from English as the form's "Translate from English"
// does, in as few model calls as one call's limits allow

// The response waits for the whole translation, which takes minutes for the longest records
export const maxDuration = 300

const requestSchema = z.object({
  type: z.enum(["project", "team_member", "client", "capability", "job_opening"]),
  id: z.string().min(1).max(100),
  // Drafts are translations of English
  language: z.enum(LANGUAGES).refine((language) => language !== DEFAULT_LANGUAGE),
  mode: z.enum(BULK_TRANSLATE_MODES).default("missing"),
  // The bulk translation run the record is part of, grouping its model calls in one Langfuse session
  runId: z.string().trim().min(1).max(200).optional(),
})

export type TranslateDraftsRequest = z.input<typeof requestSchema>
export type TranslateDraftsType = TranslateDraftsRequest["type"]
// "saved" when drafts were saved, with how many fields were left untranslated, as the AI returned nothing
// for them or text too long for the field; "skipped" when the record had nothing to translate in the language, e.g.
// translated or brought up to date meanwhile
export type TranslateDraftsResponse = { status: "saved"; untranslated: number } | { status: "skipped" } | { error: string }

// A record or nested item to translate into the language, with its English text and, when re-translating an outdated
// translation, the field's text in it
interface ItemToTranslate {
  target: Omit<TranslationDraftInput, "fields">
  fields: { field: string; description: FieldDescription; text: string; current?: string }[]
}

// The item to translate when the mode translates its translation in the language (bulkTranslates) and English has text in
// any described field. Fields English has no text in are left out, so a replaced translation loses them
function itemToTranslate(
  target: ItemToTranslate["target"],
  english: object,
  translations: readonly TranslationStatusLike[] | null | undefined,
  descriptions: Record<string, FieldDescription>,
  language: Language,
  mode: BulkTranslateMode
): ItemToTranslate[] {
  const translation = findTranslation(translations, language)
  if (!bulkTranslates(translation, mode)) return []
  const fields = Object.entries(descriptions).flatMap(([field, description]) => {
    const text = (english as Record<string, unknown>)[field]
    const current = (translation as Record<string, unknown> | undefined)?.[field]
    return typeof text === "string" && text.trim() ? [{ field, description, text, ...(typeof current === "string" ? { current } : {}) }] : []
  })
  return fields.length ? [{ target, fields }] : []
}

type AdminClient = Awaited<ReturnType<typeof getAdminClient>>

// What the record has to translate in the mode, from its and its nested items' translations and English content, the
// nested items' names labelling them. The translations' content fields, the text an outdated one has now, are only read
// when the mode re-translates outdated ones
async function loadToTranslate(client: AdminClient, type: TranslateDraftsType, id: string, language: Language, mode: BulkTranslateMode) {
  const outdated = mode === "missing_or_outdated"
  switch (type) {
    case "project": {
      const { data } = await client.query<Query>({
        query: gql`
          query ($id: ID!, $outdated: Boolean!) {
            project(id: $id, includeUnpublished: true) {
              id
              name
              industry
              type
              summary
              description
              translations {
                language
                outdated
                ... @include(if: $outdated) {
                  name
                  industry
                  type
                  summary
                  description
                }
              }
              teamMembers(includeUnpublished: true) {
                teamMember {
                  id
                  name
                }
                description
                translations {
                  language
                  outdated
                  ... @include(if: $outdated) {
                    description
                  }
                }
              }
            }
          }
        `,
        variables: { id, outdated },
        fetchPolicy: "no-cache",
      })
      const project = data?.project as Project | null | undefined
      if (!project) return undefined

      const items = itemToTranslate(
        { type: TranslatedRecordType.Project, id },
        project,
        project.translations,
        projectFieldDescriptions,
        language,
        mode
      )
      // While team members are off their contributions are hidden in the admin, so they aren't translated
      const showsTeamMembers = showsSource(await getKnowledgeSources(), "teamMembers")
      for (const contribution of showsTeamMembers ? (project.teamMembers ?? []) : []) {
        if (!contribution?.teamMember || !contributionHasEnglish(contribution)) continue
        const { teamMember } = contribution
        items.push(
          ...itemToTranslate(
            { type: TranslatedRecordType.ProjectTeamMember, id, team_member_id: teamMember.id },
            contribution,
            contribution.translations,
            contributionFieldDescriptions(teamMember.name),
            language,
            mode
          )
        )
      }
      return { record: projectRecordKind, items }
    }

    case "team_member": {
      const { data } = await client.query<Query>({
        query: gql`
          query ($id: ID!, $outdated: Boolean!) {
            teamMember(id: $id, includeUnpublished: true) {
              id
              job_title
              capability_highlights
              bio
              education
              translations {
                language
                outdated
                ... @include(if: $outdated) {
                  job_title
                  capability_highlights
                  bio
                  education
                }
              }
              experiences {
                id
                company
                position
                description
                translations {
                  language
                  outdated
                  ... @include(if: $outdated) {
                    position
                    description
                  }
                }
              }
            }
          }
        `,
        variables: { id, outdated },
        fetchPolicy: "no-cache",
      })
      const teamMember = data?.teamMember as TeamMember | null | undefined
      if (!teamMember) return undefined

      const items = itemToTranslate(
        { type: TranslatedRecordType.TeamMember, id },
        teamMember,
        teamMember.translations,
        teamMemberFieldDescriptions,
        language,
        mode
      )
      for (const experience of teamMember.experiences ?? []) {
        if (!experience) continue
        items.push(
          ...itemToTranslate(
            { type: TranslatedRecordType.Experience, id: experience.id },
            experience,
            experience.translations,
            experienceFieldDescriptions(experience.company),
            language,
            mode
          )
        )
      }
      return { record: teamMemberRecordKind, items }
    }

    case "client": {
      const { data } = await client.query<Query>({
        query: gql`
          query ($id: ID!, $outdated: Boolean!) {
            client(id: $id, includeUnpublished: true) {
              id
              summary
              description
              translations {
                language
                outdated
                ... @include(if: $outdated) {
                  summary
                  description
                }
              }
            }
          }
        `,
        variables: { id, outdated },
        fetchPolicy: "no-cache",
      })
      const record = data?.client as Client | null | undefined
      if (!record) return undefined
      return {
        record: clientRecordKind,
        items: itemToTranslate({ type: TranslatedRecordType.Client, id }, record, record.translations, clientFieldDescriptions, language, mode),
      }
    }

    case "capability": {
      const { data } = await client.query<Query>({
        query: gql`
          query ($id: ID!, $outdated: Boolean!) {
            capability(id: $id, includeUnpublished: true) {
              id
              name
              description
              translations {
                language
                outdated
                ... @include(if: $outdated) {
                  name
                  description
                }
              }
            }
          }
        `,
        variables: { id, outdated },
        fetchPolicy: "no-cache",
      })
      const capability = data?.capability as Capability | null | undefined
      if (!capability) return undefined
      return {
        record: capabilityRecordKind,
        items: itemToTranslate(
          { type: TranslatedRecordType.Capability, id },
          capability,
          capability.translations,
          capabilityFieldDescriptions,
          language,
          mode
        ),
      }
    }

    case "job_opening": {
      const { data } = await client.query<Query>({
        query: gql`
          query ($id: ID!, $outdated: Boolean!) {
            jobOpening(id: $id, includeUnpublished: true) {
              id
              title
              summary
              description
              translations {
                language
                outdated
                ... @include(if: $outdated) {
                  title
                  summary
                  description
                }
              }
            }
          }
        `,
        variables: { id, outdated },
        fetchPolicy: "no-cache",
      })
      const jobOpening = data?.jobOpening as JobOpening | null | undefined
      if (!jobOpening) return undefined
      return {
        record: jobOpeningRecordKind,
        items: itemToTranslate(
          { type: TranslatedRecordType.JobOpening, id },
          jobOpening,
          jobOpening.translations,
          jobOpeningFieldDescriptions,
          language,
          mode
        ),
      }
    }
  }
}

// Saves the drafts of items with no translation in the language; with `replaceOutdated`, also those replacing a translation
// still outdated when saving. An item translated, or brought up to date, meanwhile keeps its translation
async function saveDrafts(client: AdminClient, language: Language, drafts: TranslationDraftInput[], replaceOutdated: boolean) {
  const { data } = await client.mutate<Mutation, MutationSaveTranslationDraftsArgs>({
    mutation: gql`
      mutation ($language: String!, $drafts: [TranslationDraftInput!]!, $replaceOutdated: Boolean) {
        saveTranslationDrafts(language: $language, drafts: $drafts, replaceOutdated: $replaceOutdated) {
          saved
          untranslated
        }
      }
    `,
    variables: { language, drafts, replaceOutdated },
  })
  return data?.saveTranslationDrafts ?? { saved: 0, untranslated: 0 }
}

// The record queries reject a record that doesn't exist, e.g. deleted since the list loaded, with a "<Record> not found" error
const isNotFound = (error: unknown) =>
  CombinedGraphQLErrors.is(error) && error.errors.length > 0 && error.errors.every(({ message }) => message.endsWith(" not found"))

const NO_LONGER_EXISTS = "This record no longer exists."

const reply = (body: TranslateDraftsResponse, status?: number) => Response.json(body, { status })

export async function POST(req: Request) {
  const { user, error } = await adminRouteAccess()
  if (error) {
    return error
  }
  // Access is checked once, here: checked again when saving, minutes later, a session ending meanwhile would redirect and
  // throw away the translation
  const client = await getAdminClient()

  const parsed = requestSchema.safeParse(await req.json().catch(() => undefined))
  if (!parsed.success) {
    return reply({ error: "Invalid translation request." }, 400)
  }
  const { type, id, language, mode, runId } = parsed.data

  let toTranslate: Awaited<ReturnType<typeof loadToTranslate>>
  try {
    toTranslate = await loadToTranslate(client, type, id, language, mode)
  } catch (e) {
    if (isNotFound(e)) return reply({ error: NO_LONGER_EXISTS }, 404)
    console.error("Error loading record to translate", e)
    return reply({ error: "The record couldn't be loaded. Try again in a moment." }, 502)
  }
  if (!toTranslate) {
    return reply({ error: NO_LONGER_EXISTS }, 404)
  }
  const { record, items } = toTranslate
  if (items.length === 0) {
    return reply({ status: "skipped" })
  }

  // Every field to translate of the record and its items, as the form sends them with an outdated translation's text as
  // the current one, split into requests within one request's limits so a long record still translates
  const fields = items.flatMap((item) => item.fields)
  const requests: TranslateRequest[] = fieldBatches(
    fields.map(({ description, text, current }) => ({ label: description.label, markdown: Boolean(description.markdown), text, current }))
  ).map((batch) => ({ record, from: DEFAULT_LANGUAGE, to: language, fields: batch }))
  const validRequests = []
  for (const request of requests) {
    const translateRequest = translateRequestSchema.safeParse(request)
    if (!translateRequest.success) {
      return reply({ error: translateRequestError(translateRequest.error, request) }, 400)
    }
    validRequests.push(translateRequest.data)
  }

  let translations: string[]
  try {
    // Side by side, so a long record takes about as long as a short one. Leaving the list aborts the request, which stops
    // the model calls
    const context = { adminEmail: user.email, recordType: type, recordId: id, runId, mode }
    translations = (await Promise.all(validRequests.map((request) => translateFields(request, req.signal, context)))).flat()
  } catch (e) {
    if (!req.signal.aborted) console.error("Error translating record", e)
    return reply({ error: TRANSLATION_FAILED }, 502)
  }
  // Cancelled while the model answered: nothing is saved, as nobody waits for it
  if (req.signal.aborted) {
    return reply({ error: "Cancelled." }, 499)
  }

  // Fields the AI returned nothing for stay untranslated for the team to fill in when reviewing, as do those whose text is
  // too long for the field, which the save leaves out. A draft replacing an outdated translation keeps that translation's
  // text in those fields for review
  let untranslated = 0
  let index = 0
  const drafts = items.flatMap(({ target, fields }): TranslationDraftInput[] => {
    const translated = fields.flatMap(({ field, text: source }) => {
      const text = translations[index++]?.trim()
      if (!text) {
        untranslated++
        return []
      }
      return [{ field, text, source }]
    })
    return translated.length ? [{ ...target, fields: translated }] : []
  })
  if (drafts.length === 0) {
    return reply({ error: TRANSLATION_FAILED }, 502)
  }

  try {
    const result = await saveDrafts(client, language, drafts, mode === "missing_or_outdated")
    if (result.saved > 0) return reply({ status: "saved", untranslated: untranslated + result.untranslated })
    // Nothing saved: every translation was too long for its field, or the record and its items were translated, or brought
    // up to date, meanwhile
    return result.untranslated > 0 ? reply({ error: TRANSLATION_FAILED }, 502) : reply({ status: "skipped" })
  } catch (e) {
    console.error("Error saving translation drafts", e)
    return reply({ error: "The translation couldn't be saved as a draft. Try again in a moment." }, 502)
  }
}
