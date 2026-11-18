import { ChatOpenAI } from "@langchain/openai"

type ReasoningEffort = "none" | "low" | "medium" | "high" | "xhigh" | "max"

// What a model's calls are for, recorded with their usage so conversation costs can be broken down by it
export type ModelPurpose = "chat" | "extraction" | "query" | "writing"

export interface ModelConfig {
  model: string
  reasoningEffort: ReasoningEffort
  purpose: ModelPurpose
}

// Model metadata key the usage handler reads the purpose from
export const PURPOSE_METADATA_KEY = "lumi_purpose"

// OpenAI models used across Lumi. GPT-6.1 Sol does not support the "none" reasoning effort.
// Add each model's prices to pricing.ts so its calls count towards the conversation costs shown in the admin

// Pre-sales agent replies and tool calls
export const CHAT_MODEL: ModelConfig = { model: "gpt-6-luna", reasoningEffort: "medium", purpose: "chat" }

// Pre-sales agent helpers that run on every turn: conversation state and meeting data extraction
export const EXTRACTION_MODEL: ModelConfig = { model: "gpt-6-luna", reasoningEffort: "none", purpose: "extraction" }

// Rewrites the visitor's question into a website search query
export const QUERY_MODEL: ModelConfig = { model: "gpt-6-luna", reasoningEffort: "none", purpose: "query" }

// Staff tools: drafts a project from a public article (MCP prepare_project_from_url)
export const PROJECT_DRAFT_MODEL: ModelConfig = { model: "gpt-6-luna", reasoningEffort: "low", purpose: "extraction" }

// Admin writing tasks: conversation summaries and article improvements
export const WRITING_MODEL: ModelConfig = { model: "gpt-6.1-sol", reasoningEffort: "low", purpose: "writing" }

// Temperature is left at the default because reasoning models may reject other values.
// OpenAI writes each prompt to its cache by default, and on GPT-5.6+ models a cache write costs 1.25x the input rate.
// Pass promptCache: false for one-off prompts that are never reused: "explicit" mode without breakpoints skips the write
export const loadOpenAILLM = ({ model, reasoningEffort, purpose }: ModelConfig, { promptCache = true }: { promptCache?: boolean } = {}) =>
  new ChatOpenAI({
    model,
    useResponsesApi: true,
    reasoning: { effort: reasoningEffort },
    promptCacheOptions: promptCache ? undefined : { mode: "explicit" },
    metadata: { [PURPOSE_METADATA_KEY]: purpose },
  })
