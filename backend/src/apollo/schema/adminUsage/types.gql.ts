export const adminUsageTypeDefs = /* GraphQL */ `
  "Token usage of one model call the admin made, as the AI SDK reports it"
  input AdminUsageInput {
    "What the call was for, as its Langfuse trace name: translate-record (record translation) or improve-text (the Markdown editor's writing assistant)"
    purpose: String!
    "The model called, e.g. gpt-6.1-sol"
    model: String!
    "Email of the admin who made the call"
    adminEmail: String!
    "Input tokens, including cached and cache write tokens"
    inputTokens: Int!
    "Input tokens read from the prompt cache. 0 when omitted"
    cachedInputTokens: Int
    "Input tokens written to the prompt cache. 0 when omitted"
    cacheWriteTokens: Int
    "Output tokens, including reasoning tokens"
    outputTokens: Int!
    "0 when omitted"
    reasoningTokens: Int
  }

  type Mutation {
    "Records the usage of one of the admin's model calls, costed at the model's prices (without a cost when the model has no price), for the dashboard. False when it could not be saved, which is logged rather than thrown"
    recordAdminUsage(input: AdminUsageInput!): Boolean!
  }
`
