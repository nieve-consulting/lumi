import { loadOpenAILLM, type ModelConfig } from "@/ai/models"
import { BaseMessage } from "@langchain/core/messages"
import { RunnableSequence } from "@langchain/core/runnables"
import { z } from "zod"

import { formatTranscript } from "../messages"
import { EXTRACT_HANDOFF_DATA_PROMPT } from "../prompts"

// OpenAI structured output requires every property, so values the human has not given are null instead of missing
const extractedDataSchema = z.object({
  name: z.string().nullable().describe("The name of the human"),
  email: z.string().nullable().describe("The email of the human"),
  phone: z.string().nullable().describe("The phone number of the human"),
  company: z.string().nullable().describe("The company or organisation of the human"),
  summary: z.string().describe("The summary of the conversation"),
  topic: z.string().describe("The topic of the conversation"),
  message: z.string().describe("What the human wants to discuss with the team, as their own message to it"),
  answers: z.array(z.string().nullable()).describe("The human's answer to each qualification question, in order, or null"),
})

// What the handoff prefills from the conversation, for the visitor to review: unset when the visitor didn't say it
export type ExtractedData = {
  name?: string
  email?: string
  phone?: string
  company?: string
  summary: string
  topic: string
  message: string
  // One per qualification question, in order, empty when the visitor hasn't answered it
  answers: string[]
}

// User and assistant messages sent to the extraction, enough for the visitor's details and needs in a long conversation
const MAX_TRANSCRIPT_MESSAGES = 50

const questionList = (questions: string[]) =>
  questions.length ? questions.map((question, index) => `${index + 1}. ${question}`).join("\n") : "(none: return an empty answers list)"

export async function invokeExtractDataChain(modelConfig: ModelConfig, messageHistory: BaseMessage[], questions: string[]): Promise<ExtractedData> {
  const model = loadOpenAILLM(modelConfig, { promptCache: false }).withStructuredOutput(extractedDataSchema, {
    method: "jsonSchema",
    strict: true,
  })
  const chain = RunnableSequence.from([EXTRACT_HANDOFF_DATA_PROMPT, model])
  const { name, email, phone, company, summary, topic, message, answers } = await chain.invoke(
    {
      transcript: formatTranscript(messageHistory, MAX_TRANSCRIPT_MESSAGES),
      questions: questionList(questions),
      now: new Date().toISOString(),
    },
    { tags: ["not_visible"] }
  )

  return {
    name: name ?? undefined,
    email: email ?? undefined,
    phone: phone ?? undefined,
    company: company ?? undefined,
    summary,
    topic,
    message,
    // Aligned with the questions whatever the model returned
    answers: questions.map((_, index) => answers[index]?.trim() ?? ""),
  }
}
