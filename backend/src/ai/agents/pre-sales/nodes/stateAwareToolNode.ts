import { requireBusinessConfig } from "@/business"
import { knowledgeSources } from "@/knowledge"
import { isAIMessage, ToolMessage } from "@langchain/core/messages"
import type { ToolCall } from "@langchain/core/messages/tool"
import { RunnableConfig } from "@langchain/core/runnables"
import { tool, ToolInputParsingException } from "@langchain/core/tools"
import { isGraphBubbleUp, isGraphDrained, type LangGraphRunnableConfig } from "@langchain/langgraph"
import { ToolNode } from "@langchain/langgraph/prebuilt"
import { z } from "zod"

import type { AgentStateType } from "../state"
import { toolsFactory } from "../tools"
import type { PreSalesSources } from "../types"

// What a tool the model called answers when its source was turned off after the model call read the knowledge sources:
// both read them from src/knowledge.ts's cache, which may refresh in between
const UNAVAILABLE = "This information is no longer available. Do not mention it: answer with the other information you have."

// What the model is told when a tool fails. ToolNode would pass on the error's message, which may name a database query
// (e.g. "Failed query: …" for an id that isn't a uuid) and reaches the model and the trace verbatim; the error is logged instead
const TOOL_FAILED = "This tool failed, so its information isn't available now. Do not retry it this turn: answer with the other information you have."

const unavailableTool = (name: string) => tool(async () => UNAVAILABLE, { name, description: "No longer available", schema: z.object({}) })

export class StateAwareToolNode extends ToolNode {
  constructor(private sources: PreSalesSources) {
    // Errors are handled in runTool
    super([], { handleToolErrors: false })
  }

  // As ToolNode handles errors, but with a generic message. Input the tool's schema refuses keeps its message, which only
  // describes the model's own arguments, so the model can correct them
  protected async runTool(call: ToolCall, config: LangGraphRunnableConfig, state: unknown) {
    try {
      return await super.runTool(call, config, state)
    } catch (error) {
      if (isGraphBubbleUp(error) || isGraphDrained(error) || config.signal?.aborted) throw error

      const invalidInput = error instanceof ToolInputParsingException
      if (!invalidInput) console.error(`Tool ${call.name} failed`, error)
      return new ToolMessage({
        status: "error",
        content: invalidInput ? `Error: ${error.message}\n Please fix your mistakes.` : TOOL_FAILED,
        name: call.name,
        tool_call_id: call.id ?? "",
      })
    }
  }

  protected async run(state: AgentStateType, config: RunnableConfig) {
    const [business, knowledge] = await Promise.all([requireBusinessConfig(this.sources.drizzle), knowledgeSources(this.sources.drizzle)])
    const tools = toolsFactory(state, config, this.sources, business.public.businessName, knowledge)

    // A call to a tool no longer bound gets a plain answer rather than ToolNode's "not found" error, and runs nothing from a
    // source that is now off
    const bound = new Set(tools.map(({ name }) => name))
    const last = state.messages.at(-1)
    const called = last && isAIMessage(last) ? (last.tool_calls ?? []).map(({ name }) => name) : []
    const unbound = [...new Set(called.filter((name) => !bound.has(name)))]
    if (unbound.length) console.warn("Tools called after their source was turned off", unbound)

    this.tools = [...tools, ...unbound.map(unavailableTool)]

    return super.run(state, config)
  }
}
