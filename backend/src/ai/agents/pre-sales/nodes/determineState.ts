import { EXTRACTION_MODEL, loadOpenAILLM } from "@/ai/models"
import { knowledgeSources } from "@/knowledge"
import { RunnableSequence } from "@langchain/core/runnables"
import { z } from "zod"

import { formatTranscript } from "../messages"
import { conversationStatePrompt } from "../prompts"
import { AgentState, ConversationState } from "../state"
import type { PreSalesSources } from "../types"

const ouputSchema = z.object({
  state: z.nativeEnum(ConversationState).describe("The state of the conversation"),
  language: z.string().describe("The language of the user's latest message, as a lowercase ISO 639-1 code"),
})

// User and assistant messages the state is picked from (tool calls and results are not counted)
const USE_MESSAGE_COUNT = 4
// Visitor messages can run to thousands of characters; the start and end of each are enough to pick the state
const MAX_MESSAGE_LENGTH = 1000

// Runs on every turn, so it only sees the last few messages. The sliding window means no prompt is ever reused, so it
// skips the cache write; keeping the input small is what keeps it cheap. The routing criteria name the structured sources
// that are on by their labels, read from the knowledge sources like the chat's
export const createDetermineState = (sources: PreSalesSources) =>
  async function determineState(state: typeof AgentState.State): Promise<typeof AgentState.Update | undefined> {
    try {
      const model = loadOpenAILLM(EXTRACTION_MODEL, { promptCache: false }).withStructuredOutput(ouputSchema, { method: "jsonSchema", strict: true })

      const chain = RunnableSequence.from([conversationStatePrompt(await knowledgeSources(sources.drizzle)), model])

      const { state: conversationState, language: replyLanguage } = await chain.invoke(
        {
          conversationState: state.conversationState,
          transcript: formatTranscript(state.messages, USE_MESSAGE_COUNT, MAX_MESSAGE_LENGTH),
        },
        { tags: ["not_visible"] }
      )

      return { conversationState, replyLanguage }
    } catch (error) {
      console.error("Error determining state", error)
      throw error
    }
  }
