import { emitStatusUpdate } from "@/ai/utils"
import { sourceTerms } from "@/knowledge"
import { listPublicClients } from "@/services/clients"
import { publicContext } from "@/services/context"
import { COMPLETE_LIST_LIMIT } from "@/services/pagination"
import { currentContent } from "@/services/translations"
import { tool } from "@langchain/core/tools"
import type { KnowledgeSources } from "@lumi/shared-contracts/knowledge"
import type { Language } from "@lumi/shared-contracts/language"

import { runText } from "../text"
import type { PreSalesSources } from "../types"
import { modelLocalized } from "./localized"

// The description names the business and the clients by the installation's labels, so it only changes when its settings do
export const getClientsTool = (language: Language, { drizzle }: PreSalesSources, businessName: string, knowledge: KnowledgeSources) => {
  const { clients } = sourceTerms(knowledge)
  return tool(
    async (_input, config) => {
      await emitStatusUpdate(runText(config).status.fetchingClients(knowledge.labels.clients))
      // The tool cannot page, so it gets every public client in one query
      const { items } = await listPublicClients(publicContext(drizzle), { limit: COMPLETE_LIST_LIMIT }, { language: currentContent(language) })
      // The language and the fields that fell back to English tell the model which text is still in English
      return JSON.stringify(
        items.map((client) => ({ id: client.id, name: client.name, summary: client.summary, ...modelLocalized(client, ["summary"]) }))
      )
    },
    {
      name: "get_clients",
      description: `Get the list of ${clients.plural} that ${businessName} has or is working with. The list contains each ${clients.singular}'s basic information and their id to get more details`,
    }
  )
}
