export const capabilitiesTypeDefs = /* GraphQL */ `
  type Query {
    "Capabilities with their content in the language, English by default: one with no translation in it, or an outdated one (English changed after it was saved), is returned in English. missingLanguage keeps those with no translation in it, not even a draft. Only public capabilities, those a published project or team member uses, unless includeUnpublished"
    capabilities(language: String, missingLanguage: String, includeUnpublished: Boolean = false): [Capability]
    "The capability with its content in the language, English by default, as capabilities returns it. A capability that is not public is not found unless includeUnpublished"
    capability(id: ID!, language: String, includeUnpublished: Boolean = false): Capability
  }

  type Capability {
    id: ID!
    name: String!
    description: String
    "Language the content was returned in: the requested one, or English when the capability has no translation in it or an outdated one"
    language: String!
    "Content fields returned in English because the translation in language leaves them untranslated; empty when the whole record came back in language"
    fallback_fields: [String!]!
    "The capability's content in every language it has, English first"
    translations: [CapabilityTranslation!]!
  }

  "A capability's content in one language, as saved. A null field is not translated in it and reads in English"
  type CapabilityTranslation {
    name: String
    description: String
    language: String!
    "When the content was last saved in this language"
    updated_at: String!
    "English changed since this translation was saved, so it may need reviewing. Always false in English"
    outdated: Boolean!
    "An AI translation saved for review: reads skip it and return English until the team saves the translation. Always false in English"
    draft: Boolean!
  }

  type TeamMemberCapability {
    id: ID!
    name: String!
    stars: Int!
    "Language the capability's name was returned in: the requested one, or English when the capability has no translation in it or an outdated one"
    language: String!
    "Content fields returned in English because the translation in language leaves them untranslated; empty when the whole record came back in language"
    fallback_fields: [String!]!
  }

  input TeamMemberCapabilityInput {
    id: ID!
    stars: Int!
  }

  input CapabilityInput {
    name: String!
    description: String
  }

  type Mutation {
    addCapabilitiesToTeamMember(teamMemberId: ID!, input: [TeamMemberCapabilityInput]!): Boolean
    updateTeamMemberCapabilities(teamMemberId: ID!, input: [TeamMemberCapabilityInput]!): Boolean
    removeTeamMemberCapabilities(teamMemberId: ID!, ids: [ID]!): Boolean
    addCapabilitiesToProject(projectId: ID!, capabilityIds: [ID!]!): Boolean
    removeProjectCapabilities(projectId: ID!, ids: [ID]!): Boolean
    "Creates the capability in English"
    createCapability(input: CapabilityInput!): ID
    "Saves the capability's content in the language, English by default. Other languages leave English as it is"
    updateCapability(id: ID!, input: CapabilityInput!, language: String): Boolean
    deleteCapability(id: ID!): Boolean
  }
`
