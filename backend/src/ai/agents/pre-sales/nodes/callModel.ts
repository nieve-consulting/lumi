import { CHAT_MODEL, loadOpenAILLM } from "@/ai/models"
import { requireBusinessConfig } from "@/business"
import { handoffConfig } from "@/handoff"
import { knowledgeSources } from "@/knowledge"
import { dispatchCustomEvent } from "@langchain/core/callbacks/dispatch"
import { AIMessage, AIMessageChunk, BaseMessage, HumanMessage, SystemMessage, ToolMessage } from "@langchain/core/messages"
import { RunnableConfig } from "@langchain/core/runnables"
import type { MessageAnnotation, Reference } from "@lumi/shared-contracts/chat"

import { ensureConfiguration } from "../configuration"
import { escapeMarkup } from "../messages"
import { CURRENT_PAGE_CONTEXT_PROMPT, PAGE_CONTEXT_PROMPT, systemPrompt, toolsExhaustedContext, TURN_CONTEXT_PROMPT } from "../prompts"
import type { AgentStateType, AgentStateUpdateType } from "../state"
import { allowedToolNames, toolsFactory } from "../tools"
import type { PreSalesSources } from "../types"

// How many times the model may call tools in one turn before it must reply. A question needs one or two rounds (a list tool,
// then a detail tool, or a search and a reworded one), so more means the model is repeating itself. Without a cap it can
// search until the graph's recursion limit fails the whole turn, as a visitor asking about "this project" once saw
const MAX_TOOL_ROUNDS = 4

// The model's tool-calling replies since the user's latest message, i.e. the tool rounds this turn has used
function toolRoundsThisTurn(messages: BaseMessage[]) {
  let rounds = 0
  for (let i = messages.length - 1; i >= 0 && !HumanMessage.isInstance(messages[i]); i--) {
    if (AIMessage.isInstance(messages[i]) && (messages[i] as AIMessage).tool_calls?.length) rounds++
  }
  return rounds
}

// Tool results of the latest step: the model can call several tools at once, and each one answers with its own message
function latestToolMessages(messages: BaseMessage[]) {
  const toolMessages: ToolMessage[] = []
  for (let i = messages.length - 1; i >= 0 && ToolMessage.isInstance(messages[i]); i--) {
    toolMessages.unshift(messages[i] as ToolMessage)
  }
  return toolMessages
}

// The most pages linked under a reply. Website search returns up to five pages per query, and a list that long crowds the
// reply, often with pages that only loosely match
const MAX_REFERENCES = 3

// Compares page URLs by site and path, as a website lists the same page with or without www, a trailing slash or a fragment
function pageKey(url: string) {
  try {
    const { host, pathname, search } = new URL(url)
    return `${host.toLowerCase().replace(/^www\./, "")}${pathname.replace(/\/+$/, "")}${search}`
  } catch {
    return undefined
  }
}

// The pages linked under a reply, from each search's results (closest match first). The searches take turns, best match first,
// so a reply that searched for two things links the best page of each: distances to different queries can't be compared. Each
// page is linked once, and the page the visitor is reading is left out, as they don't need a link to it
function replyReferences(searches: Reference[][], pageUrl: string | undefined) {
  const linked = new Set<string>()
  const currentPage = pageUrl && pageKey(pageUrl)
  if (currentPage) linked.add(currentPage)

  const references: Reference[] = []
  const rounds = Math.max(...searches.map((results) => results.length))
  for (let rank = 0; rank < rounds && references.length < MAX_REFERENCES; rank++) {
    for (const results of searches) {
      const reference = results[rank]
      const key = reference && pageKey(reference.url)
      if (!key || linked.has(key) || references.length === MAX_REFERENCES) continue
      linked.add(key)
      references.push(reference)
    }
  }
  return references
}

export const createCallModel = (sources: PreSalesSources) =>
  async function callModel(state: AgentStateType, config: RunnableConfig): Promise<AgentStateUpdateType | undefined> {
    const additional_kwargs: MessageAnnotation = {}
    const configuration = ensureConfiguration(config)
    const toolMessages = latestToolMessages(state.messages)
    const directMessages: string[] = []
    const searches: Reference[][] = []

    for (const { artifact } of toolMessages) {
      if (artifact && "cards" in artifact) {
        additional_kwargs.cards = [...(additional_kwargs.cards ?? []), ...artifact.cards]
      }

      if (artifact && "references" in artifact) {
        searches.push(artifact.references)
      }

      if (artifact && "directMessage" in artifact) {
        directMessages.push(artifact.directMessage)
      }
    }

    const references = replyReferences(searches, configuration.pageUrl)
    if (references.length) additional_kwargs.references = references

    let response: AIMessageChunk | undefined = undefined

    // The model is skipped only when every tool result shows a card with a fixed intro (see cardIntro); any other result still
    // needs a reply from the model
    if (toolMessages.length && directMessages.length === toolMessages.length) {
      const directMessage = directMessages.join("\n\n")
      response = new AIMessageChunk(directMessage)
      await dispatchCustomEvent("directMessage", directMessage)
    }

    if (!response) {
      // Cached per process, so the system prompt and the tool descriptions only change when an admin edits the settings
      const [business, handoff, knowledge] = await Promise.all([
        requireBusinessConfig(sources.drizzle),
        handoffConfig(sources.drizzle),
        knowledgeSources(sources.drizzle),
      ])
      // The same tool list on every call with allowed_tools restricting it per state and to turns with a page to read, so a state
      // change or a turn without a page keeps the cached prefix
      // A turn that has used its tool rounds allows none, so the model replies with what it found
      const toolsExhausted = toolRoundsThisTurn(state.messages) >= MAX_TOOL_ROUNDS
      const allowedTools = toolsExhausted ? [] : allowedToolNames(state.conversationState, knowledge, !!configuration.pageUrl)
      const model = loadOpenAILLM(CHAT_MODEL).bindTools(toolsFactory(state, config, sources, business.public.businessName, knowledge), {
        tool_choice: allowedTools.length
          ? { type: "allowed_tools", mode: "auto", tools: allowedTools.map((name) => ({ type: "function", name })) }
          : "none",
      })

      // Per-turn context goes after the history so the system prompt and the history stay a cacheable prefix
      const turnContext = [await TURN_CONTEXT_PROMPT.format({ conversation_state: state.conversationState })]
      // A page to read is named by its URL alone: the title the client sends may be another page's, e.g. where the chat loaded
      // Both come from the visitor's browser, so their markup is escaped and they can't close the tag that marks them as page metadata
      if (configuration.pageUrl) {
        turnContext.push(await CURRENT_PAGE_CONTEXT_PROMPT.format({ page_url: escapeMarkup(configuration.pageUrl) }))
      } else if (configuration.pageTitle) {
        turnContext.push(await PAGE_CONTEXT_PROMPT.format({ page_title: escapeMarkup(configuration.pageTitle) }))
      }
      if (toolsExhausted) {
        console.warn(`Turn used its ${MAX_TOOL_ROUNDS} tool rounds; replying without more tools`)
        turnContext.push(toolsExhaustedContext(handoff.public))
      }

      try {
        response = await model.invoke([
          // OpenAI only reuses a cache entry at a breakpoint written by an earlier request. The implicit breakpoint covers the
          // conversation so far; this explicit one ends at the system prompt so every conversation shares the tools and the
          // instructions. It is only written once the tools and the system prompt reach 1024 tokens (see AGENTS.md)
          new SystemMessage({
            content: [{ type: "text", text: systemPrompt(business, handoff.public, knowledge), prompt_cache_breakpoint: { mode: "explicit" } }],
          }),
          ...state.messages,
          new SystemMessage(turnContext.join("\n")),
        ])
      } catch (error) {
        console.error("Error invoking model", error)
        throw error
      }
    }

    if (additional_kwargs && Object.keys(additional_kwargs).length > 0) {
      response.additional_kwargs = additional_kwargs
      await dispatchCustomEvent("messageAnnotation", additional_kwargs)
    }

    return { messages: [response] }
  }
