import { QUERY_MODEL } from "@/ai/models"
import { emitStatusUpdate } from "@/ai/utils"
import { baseLanguage, inLanguage } from "@/services/pageLanguages"
import { tool } from "@langchain/core/tools"
import { z } from "zod"

import { invokeRetrievalContextualizedQuery } from "../chains/retrievalContextualize"
import { ensureConfiguration } from "../configuration"
import type { AgentStateType } from "../state"
import { runText } from "../text"
import type { PreSalesSources } from "../types"

const USE_CONTEXT_LAST_MESSAGES = 5 // Use last 5 messages as context to generate query

// Searches the pages of the business's websites (EmbeddingSource.searchWebsite) and links them as references. It prefers pages
// in the language of the visitor's latest message, else the chat's, and links only those when it found any: a page in another
// language still informs the reply, but a link to it doesn't help the visitor. The description names the business, so it only
// changes when its settings do
export const webpageSearchTool = (state: AgentStateType, { embeddings }: PreSalesSources, businessName: string) =>
  tool(
    async (input, config) => {
      await emitStatusUpdate(runText(config).status.searchingWebpages)

      // Using the last 5 message refine the query to get the most relevant information
      const lastMessages = state.messages
        .filter((m) => ["ai", "human"].indexOf(m.getType()) >= 0 && m.text) // only ai and human messages with content
        .slice(-(USE_CONTEXT_LAST_MESSAGES + 1), -1) // last X messages excluding the last one which in in input.query

      const queryContext = await invokeRetrievalContextualizedQuery(QUERY_MODEL, lastMessages, input.query)

      const language = baseLanguage(state.replyLanguage) ?? ensureConfiguration(config).language
      const results = await embeddings.searchWebsite(queryContext.query, language)
      if (results.length === 0) {
        return [
          `Nothing on ${businessName}'s website matches this query. Do not answer it from assumptions or general knowledge: say you don't have that information.`,
          {},
        ]
      }

      const found = results.map(({ title, url, passages }) => ({ title, url, content: passages }))
      const linked = results.some((result) => inLanguage(result, language)) ? results.filter((result) => inLanguage(result, language)) : results
      const references = linked.map(({ title, url }) => ({ url, title }))

      return [
        `The following passages were found on ${businessName}'s website, closest match first. Answer only with what they say:` +
          JSON.stringify(found),
        { references },
      ]
    },
    {
      name: "webpage_search",
      description: `Search the pages of ${businessName}'s website, such as its services, pricing, articles, FAQs and policies. Use it for any question about ${businessName} that your other tools don't answer, and before saying you don't have some information. Returns the closest passages with the title and URL of their page.`,
      schema: z.object({ query: z.string().describe("What to search for, as a self-contained question") }),
      responseFormat: "content_and_artifact",
    }
  )
