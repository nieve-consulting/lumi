export const threadsTypeDefs = /* GraphQL */ `
  type Query {
    thread(id: ID!): Thread
    threads: [Thread!]!
  }

  type Thread {
    id: ID!
    createdAt: String!
    closed: Boolean!
    topic: String
    summary: String
    email: String
    phone: String
    name: String
    "The http(s) URL of the page the visitor started the conversation on, e.g. the website page embedding the chat, keeping only its utm_source, utm_medium, utm_campaign and utm_id query parameters. Only pages on the business website, a crawled website or the Lumi app are recorded. Null when unknown, as for conversations started before it was recorded"
    pageUrl: String
    "Total LLM cost in USD of the conversation's model calls (agent turns, helpers and summaries). Null when no usage was recorded, or when a call has no price and the total would be incomplete"
    cost: Float
    "Token usage and cost per purpose and model, most expensive first. Empty when no usage was recorded"
    usage: [ModelUsage!]!
  }

  type ModelUsage {
    "What the calls were for: chat (agent replies and tool calls), extraction (conversation state and meeting data), query (website search queries), writing (summaries), embedding (website search embeddings) or other. On the dashboard also the admin's own calls: translate-record (record translation), improve-text (the editor's writing assistant) and crawl-website (the embeddings of the website crawls an admin starts)"
    purpose: String!
    model: String!
    "Whether these are the admin's own calls rather than a conversation's"
    adminCalls: Boolean!
    "Number of model calls"
    calls: Int!
    "Input tokens, including cached and cache write tokens"
    inputTokens: Int!
    "Input tokens read from the prompt cache, billed at the cached rate"
    cachedInputTokens: Int!
    "Input tokens written to the prompt cache, billed at the cache write rate"
    cacheWriteTokens: Int!
    "Output tokens, including reasoning tokens"
    outputTokens: Int!
    reasoningTokens: Int!
    "Cost in USD. Null when a call has no price and the cost would be incomplete"
    cost: Float
  }

  input ThreadInput {
    closed: Boolean
    topic: String
    summary: String
    email: String
    phone: String
    name: String
  }

  type Mutation {
    createThread: ID!
    deleteThread(id: ID!): Boolean!
    updateThread(id: ID!, input: ThreadInput!): Boolean
  }
`
