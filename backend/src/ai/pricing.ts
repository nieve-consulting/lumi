// OpenAI standard tier prices in USD per million tokens (https://developers.openai.com/api/docs/pricing).
// Add a model here when it is added to models.ts or to the admin's frontend/src/lib/models.ts (recordAdminUsage): calls to a
// model without a price are recorded without a cost
interface ModelPrice {
  input: number
  cachedInput: number
  cacheWrite: number
  output: number
}

const MODEL_PRICES: Record<string, ModelPrice> = {
  "gpt-6-luna": { input: 0.1, cachedInput: 0.01, cacheWrite: 0.125, output: 0.5 },
  "gpt-6.1-sol": { input: 2, cachedInput: 0.1, cacheWrite: 2.5, output: 10 },
  // Embeddings only bill input tokens: website search queries and the crawler's vectors (see LumiVectorStore), and the
  // crawler's semantic chunking
  "text-embedding-3-small": { input: 0.02, cachedInput: 0, cacheWrite: 0, output: 0 },
  "text-embedding-3-large": { input: 0.13, cachedInput: 0, cacheWrite: 0, output: 0 },
}

export interface TokenUsage {
  // Cached and cache write tokens are part of the input tokens
  inputTokens: number
  cachedInputTokens: number
  cacheWriteTokens: number
  // Reasoning tokens are part of the output tokens and billed at the output rate
  outputTokens: number
  reasoningTokens: number
}

// Cost in USD of one model call, or null when the model has no price
export function computeCost(model: string, { inputTokens, cachedInputTokens, cacheWriteTokens, outputTokens }: TokenUsage) {
  // Own keys only: the model comes from callers such as recordAdminUsage, and e.g. "constructor" is inherited
  if (!Object.hasOwn(MODEL_PRICES, model)) return null
  const price = MODEL_PRICES[model]

  const uncachedInputTokens = Math.max(inputTokens - cachedInputTokens - cacheWriteTokens, 0)

  return (
    (uncachedInputTokens * price.input + cachedInputTokens * price.cachedInput + cacheWriteTokens * price.cacheWrite + outputTokens * price.output) /
    1_000_000
  )
}
