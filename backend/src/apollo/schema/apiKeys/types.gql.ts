export const apiKeysTypeDefs = /* GraphQL */ `
  "What a generated API key may do. Neither may manage API keys or administrators"
  enum ApiKeyAccess {
    "Published records and public business data: no mutations, no admin-only queries or staff-only fields, includeUnpublished refused, draft and outdated translations left out. Can render PDFs, without running their scripts"
    READ_ONLY
    "Every query and mutation the admin interface uses, but managing API keys or administrators (or setting the installation up). Can render PDFs, without running their scripts"
    ADMIN
  }

  "An API key an admin generated for another system, such as a website. Its secret is never returned after it was created"
  type ApiKey {
    id: ID!
    name: String!
    access: ApiKeyAccess!
    "The secret's last 4 characters, to tell keys apart"
    lastCharacters: String!
    createdAt: String!
    "Email of the admin who created it, when known"
    createdBy: String
    "When it was last used, recorded at most about once a minute; null until first used"
    lastUsedAt: String
  }

  type CreatedApiKey {
    apiKey: ApiKey!
    "The key itself, shown once: only its hash is stored"
    secret: String!
  }

  "An invalid one fails with BAD_USER_INPUT and extensions.problems for name"
  input NewApiKeyInput {
    "Trimmed; 1 to 100 characters"
    name: String!
    access: ApiKeyAccess!
    "Email of the admin creating it"
    createdBy: String
  }

  type Query {
    "The active API keys, the newest first. Only with the installation's internal API key"
    apiKeys: [ApiKey!]!
  }

  type Mutation {
    "Generates an API key. Only with the installation's internal API key"
    createApiKey(input: NewApiKeyInput!): CreatedApiKey!
    "Revokes the key: it is refused from then on (on AWS, within the authorizer's cache time). Fails with NOT_FOUND when it doesn't exist or was already revoked. Only with the installation's internal API key"
    revokeApiKey(id: ID!): Boolean!
  }
`
