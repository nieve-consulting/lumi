export const clientsTypeDefs = /* GraphQL */ `
  type Query {
    "Clients with their content in the language, English by default, and their nested records too: one with no translation in it, or an outdated one (English changed after it was saved), is returned in English. missingLanguage keeps those with no translation in it, not even a draft. Only published clients unless includeUnpublished"
    clients(language: String, missingLanguage: String, includeUnpublished: Boolean = false): [Client]
    "The client with its content in the language, English by default, as clients returns it. An unpublished client is not found unless includeUnpublished"
    client(id: ID!, language: String, includeUnpublished: Boolean = false): Client
    "The client with its content in the language, English by default, as clients returns it. An unpublished client is not found unless includeUnpublished"
    clientBySlug(url_slug: String!, language: String, includeUnpublished: Boolean = false): Client
  }

  type Client {
    id: ID!
    name: String!
    summary: String!
    url_slug: String!
    internal_webpage: String
    client_website: String
    description: String
    logo_key: ID
    "Approved for external disclosure"
    published: Boolean!
    "The client's published projects; includeUnpublished adds unpublished ones"
    projects(includeUnpublished: Boolean = false): [Project]
    "Language the content was returned in: the requested one, or English when the client has no translation in it or an outdated one"
    language: String!
    "Content fields returned in English because the translation in language leaves them untranslated; empty when the whole record came back in language"
    fallback_fields: [String!]!
    "The client's content in every language it has, English first"
    translations: [ClientTranslation!]!
  }

  "A client's content in one language, as saved. A null field is not translated in it and reads in English"
  type ClientTranslation {
    summary: String
    description: String
    language: String!
    "When the content was last saved in this language"
    updated_at: String!
    "English changed since this translation was saved, so it may need reviewing. Always false in English"
    outdated: Boolean!
    "An AI translation saved for review: reads skip it and return English until the team saves the translation. Always false in English"
    draft: Boolean!
  }

  input ClientInput {
    name: String!
    summary: String!
    url_slug: String!
    description: String
    internal_webpage: String
    client_website: String
    published: Boolean
  }

  type Mutation {
    "Creates the client in English"
    createClient(input: ClientInput!): ID
    "Saves the client's content in the language, English by default. English also saves its shared fields; other languages leave English and the shared fields as they are"
    updateClient(id: ID!, input: ClientInput!, language: String): Boolean
    deleteClient(id: ID!): Boolean
    linkUploadToClientLogo(key: ID!, clientId: ID!): Boolean
  }
`
