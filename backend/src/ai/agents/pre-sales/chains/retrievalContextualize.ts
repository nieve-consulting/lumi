import { loadOpenAILLM, type ModelConfig } from "@/ai/models"
import { BaseMessage } from "@langchain/core/messages"
import { RunnableSequence } from "@langchain/core/runnables"
import { z } from "zod"

import { formatTranscript } from "../messages"
import { CONTEXTUALIZE_RETRIEVAL_PROMPT } from "../prompts"

export async function invokeRetrievalContextualizedQuery(modelConfig: ModelConfig, messageHistory: BaseMessage[], originalQuery: string) {
  const model = loadOpenAILLM(modelConfig, { promptCache: false }).withStructuredOutput(
    z.object({
      query: z.string().describe("The refined query to be used for retrieval using cosine distance of embeddings"),
      filter: z.array(z.enum(["blog", "company_page", "service"])).describe("The filters to be used for retrieval"),
    })
  )

  const chain = RunnableSequence.from([CONTEXTUALIZE_RETRIEVAL_PROMPT, model])
  return await chain.invoke({ transcript: formatTranscript(messageHistory), originalQuery }, { tags: ["not_visible"] })
}
