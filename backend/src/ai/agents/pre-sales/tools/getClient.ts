import { emitStatusUpdate } from "@/ai/utils"
import { sourceTerms } from "@/knowledge"
import { getPublicClient, type PublicClient } from "@/services/clients"
import { publicContext } from "@/services/context"
import { COMPLETE_NESTED_LIMIT } from "@/services/pagination"
import { currentContent } from "@/services/translations"
import { tool } from "@langchain/core/tools"
import type { KnowledgeSources } from "@lumi/shared-contracts/knowledge"
import type { Language } from "@lumi/shared-contracts/language"
import { z } from "zod"

import { cardIntro, runText } from "../text"
import type { PreSalesSources } from "../types"
import { modelLocalized } from "./localized"
import { recordIdSchema } from "./recordId"

// What the chat's client card renders (card_type "client"). No projects while projects are off
export type ClientCard = {
  id: string
  name: string
  summary: string
  description: string | null
  logo_key: string | null
  projects: { id: string; name: string }[]
  logo_url?: string
}

// Public client record from the shared service, with complete relationship lists, in the shape the chat's client card renders
async function getClient({ drizzle }: PreSalesSources, id: string, language: Language, knowledge: KnowledgeSources) {
  const { record, media } = await getPublicClient(publicContext(drizzle), id, {
    nestedLimit: COMPLETE_NESTED_LIMIT,
    language: currentContent(language),
  })

  const card: ClientCard = {
    id: record.id,
    name: record.name,
    summary: record.summary,
    description: record.description,
    logo_key: media.logoKey,
    projects: knowledge.projects ? record.projects.items.map(({ id, name }) => ({ id, name })) : [],
    logo_url: record.logo_url ?? undefined,
  }

  return { card, record }
}

// The details the model keeps in the conversation, without the logo that only the card uses, nor the projects while they are
// off. Each text comes with the language it was returned in and the fields that fell back to English, so the model knows
// which text is still in English
function toModelContent(client: PublicClient, knowledge: KnowledgeSources) {
  return JSON.stringify({
    id: client.id,
    name: client.name,
    summary: client.summary,
    description: client.description,
    ...modelLocalized(client),
    ...(knowledge.projects && {
      projects: client.projects.items.map((project) => ({ id: project.id, name: project.name, ...modelLocalized(project, ["name"]) })),
    }),
  })
}

// The description names the clients and what their details include by the installation's labels and sources, so it only
// changes when its settings do
export const getClientTool = (language: Language, sources: PreSalesSources, knowledge: KnowledgeSources) => {
  const terms = sourceTerms(knowledge)
  return tool(
    async (input, config) => {
      await emitStatusUpdate(runText(config).status.fetchingClient(knowledge.labels.clients))
      const { card, record } = await getClient(sources, input.id, language, knowledge)
      return [
        toModelContent(record, knowledge),
        { cards: [{ card_type: "client", payload: card, id: input.id }], ...cardIntro(language, record.language, card.name) },
      ]
    },
    {
      name: "get_client",
      description: `Get the details on ${terms.clients.aSingular} and show them to the user as a card. Details include name, description, logo${knowledge.projects ? ` and a list of ${terms.projects.plural}` : ""}.`,
      schema: z.object({
        id: recordIdSchema().describe(
          `The ID of the ${terms.clients.singular} to get details on. This ID can be retrieved from the get_clients function.`
        ),
      }),
      responseFormat: "content_and_artifact",
    }
  )
}
