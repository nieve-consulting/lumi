import { loadOpenAILLM, type ModelConfig } from "@/ai/models"
import type { Callbacks } from "@langchain/core/callbacks/manager"
import { AIMessageChunk, BaseMessage } from "@langchain/core/messages"
import { RunnableSequence } from "@langchain/core/runnables"
import type { ConversationSummary, SummaryChunk } from "@lumi/shared-contracts/pre-sales"
import { parse } from "partial-json"
import { z } from "zod"

import { formatTranscript } from "../messages"
import { SUMMARIZE_PROMPT } from "../prompts"

// OpenAI structured output requires every property, so details the user has not given are null instead of missing
const summarySchema = z.object({
  summary: z.string().describe("A summary of the conversation, in English"),
  topic: z.string().describe("Topic of the conversation, in English"),
  email: z.string().nullable().describe("The email of the user in the conversation only if provided"),
  name: z.string().nullable().describe("The name of the user in the conversation only if provided"),
  phone: z.string().nullable().describe("The phone of the user in the conversation only if provided"),
})

// Missing details stay undefined so saving the summary does not clear values already stored on the thread
function toConversationSummary({ email, name, phone, ...rest }: z.infer<typeof summarySchema>): ConversationSummary {
  return { ...rest, email: email ?? undefined, name: name ?? undefined, phone: phone ?? undefined }
}

// Streams newline-delimited JSON: each line is the summary generated so far, the last one is the complete summary.
// onSettled runs when the summary ends, whether it succeeded or not, before the stream closes
export function streamSummary(
  modelConfig: ModelConfig,
  messageHistory: BaseMessage[],
  signal: AbortSignal,
  callbacks: Callbacks | undefined,
  onStreamDone: (response: ConversationSummary) => Promise<void>,
  onSettled: () => Promise<void>
) {
  const model = loadOpenAILLM(modelConfig, { promptCache: false }).withStructuredOutput(summarySchema, {
    method: "jsonSchema",
    strict: true,
  })
  const chain = RunnableSequence.from([SUMMARIZE_PROMPT, model])
  const encoder = new TextEncoder()

  let cancelled = false

  return new ReadableStream<Uint8Array>({
    async start(controller) {
      const push = (chunk: SummaryChunk) => {
        if (!cancelled) controller.enqueue(encoder.encode(JSON.stringify(chunk) + "\n"))
      }

      let response = new AIMessageChunk("")
      let rootRunId: string | undefined
      let failure: { error: unknown } | undefined

      try {
        // The root run name is the Langfuse trace name
        const lcStream = chain.streamEvents(
          { transcript: formatTranscript(messageHistory) },
          { version: "v2", signal, callbacks, runName: "pre-sales-summary" }
        )

        for await (const item of lcStream) {
          rootRunId ??= item.run_id

          switch (item.event) {
            // Structured output is parsed inside the model runnable, so the final summary is the output of the root chain
            case "on_chain_end":
              if (item.run_id === rootRunId) {
                const summary = toConversationSummary(item.data.output)
                push(summary)
                await onStreamDone(summary)
              }
              break

            case "on_chat_model_stream":
              {
                const chunk = item.data.chunk
                if (chunk) {
                  response = response.concat(chunk)
                  // The Responses API streams content as blocks, so read the joined text
                  if (response.text) {
                    push(parse(response.text))
                  }
                }
              }
              break
          }
        }
      } catch (error) {
        console.error("Error summarizing conversation", error)
        failure = { error }
      }

      // Before closing: the response ends with the stream, and Lambda freezes the environment as soon as it is done
      await onSettled()

      if (cancelled) return
      if (failure) {
        controller.error(failure.error)
      } else {
        controller.close()
      }
    },
    cancel() {
      cancelled = true
    },
  })
}
