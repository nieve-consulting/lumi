import { PURPOSE_METADATA_KEY } from "@/ai/models"
import type DbDataSource from "@/apollo/sources/dbDataSource"
import { BaseCallbackHandler } from "@langchain/core/callbacks/base"
import type { Serialized } from "@langchain/core/load/serializable"
import { AIMessage, type BaseMessage } from "@langchain/core/messages"
import type { ChatGeneration, LLMResult } from "@langchain/core/outputs"

import { computeCost, type TokenUsage } from "./pricing"

// Custom event dispatched with the tokens of each embedding request made inside a run (see LumiVectorStore). Embedding
// models do not report their usage through the model callbacks
export const EMBEDDING_USAGE_EVENT = "embeddingUsage"

export interface EmbeddingUsage {
  model: string
  inputTokens: number
}

// Usage and cost of one model call. The purpose is the ModelConfig's, "embedding" for embeddings, or "other" for a chat
// model not loaded with loadOpenAILLM
export type ModelCallUsage = TokenUsage & { model: string; purpose: string; cost: number | null }

interface ModelCall {
  model: string
  purpose: string
}

interface UsageHandlerInput {
  db: DbDataSource
  threadId: string
}

// Collects the token usage and cost of every model call in a run and saves them against its thread with flush(). Nested runs
// (helper chains, tools) inherit the run's callbacks, so pass it to the root run
class UsageHandler extends BaseCallbackHandler {
  name = "usage_handler"

  readonly db: DbDataSource
  readonly threadId: string
  // Model name and purpose of each running model call, as configured in models.ts
  private calls = new Map<string, ModelCall>()
  // Usage of the calls that ended since the last flush
  private pending: ModelCallUsage[] = []

  constructor({ db, threadId }: UsageHandlerInput) {
    // Awaited so each call's usage is collected before the run moves on, and a flush after the run sees every call
    super({ _awaitHandler: true })
    this.db = db
    this.threadId = threadId
  }

  handleChatModelStart(
    _llm: Serialized,
    _messages: BaseMessage[][],
    runId: string,
    _parentRunId?: string,
    _extraParams?: Record<string, unknown>,
    _tags?: string[],
    metadata?: Record<string, unknown>
  ) {
    if (typeof metadata?.ls_model_name === "string") {
      const purpose = metadata[PURPOSE_METADATA_KEY]
      this.calls.set(runId, { model: metadata.ls_model_name, purpose: typeof purpose === "string" ? purpose : "other" })
    }
  }

  handleLLMEnd(output: LLMResult, runId: string) {
    const call = this.calls.get(runId)
    this.calls.delete(runId)

    // Streamed calls end with the concatenated chunk, which carries the usage of the whole response (AIMessage.isInstance matches chunks too)
    const message = (output.generations[0]?.[0] as ChatGeneration | undefined)?.message
    const usage = AIMessage.isInstance(message) ? message.usage_metadata : undefined
    if (!usage || !call) return

    const tokens = {
      inputTokens: usage.input_tokens,
      cachedInputTokens: usage.input_token_details?.cache_read ?? 0,
      cacheWriteTokens: usage.input_token_details?.cache_creation ?? 0,
      outputTokens: usage.output_tokens,
      reasoningTokens: usage.output_token_details?.reasoning ?? 0,
    }
    this.record(call, tokens)
  }

  handleCustomEvent(eventName: string, data: unknown) {
    if (eventName !== EMBEDDING_USAGE_EVENT) return

    const { model, inputTokens } = data as EmbeddingUsage
    this.record({ model, purpose: "embedding" }, { inputTokens, cachedInputTokens: 0, cacheWriteTokens: 0, outputTokens: 0, reasoningTokens: 0 })
  }

  handleLLMError(_error: unknown, runId: string) {
    this.calls.delete(runId)
  }

  private record(call: ModelCall, tokens: TokenUsage) {
    const cost = computeCost(call.model, tokens)
    if (cost === null) {
      console.warn(`No price for model ${call.model}: its usage is recorded without a cost`)
    }

    this.pending.push({ ...call, ...tokens, cost })
  }

  // Saves the collected usage in one insert. Await it before the response ends: Lambda freezes the environment as soon as
  // the response is done
  async flush() {
    const usage = this.pending
    this.pending = []
    if (usage.length) {
      await this.db.addThreadUsage(this.threadId, usage)
    }
  }
}

export function createUsageHandler(db: DbDataSource, threadId: string) {
  return new UsageHandler({ db, threadId })
}
