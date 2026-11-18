export const experienceTypeDefs = /* GraphQL */ `
  type Experience {
    id: ID!
    company: String!
    position: String!
    location: String!
    description: String
    start_date: String!
    logo_key: ID
    end_date: String
    "Language the content was returned in: the requested one, or English when the experience has no translation in it or an outdated one"
    language: String!
    "Content fields returned in English because the translation in language leaves them untranslated; empty when the whole record came back in language"
    fallback_fields: [String!]!
    "The experience's content in every language it has, English first"
    translations: [ExperienceTranslation!]!
  }

  "A work experience's content in one language, as saved. A null field is not translated in it and reads in English"
  type ExperienceTranslation {
    position: String
    description: String
    language: String!
    "When the content was last saved in this language"
    updated_at: String!
    "English changed since this translation was saved, so it may need reviewing. Always false in English"
    outdated: Boolean!
    "An AI translation saved for review: reads skip it and return English until the team saves the translation. Always false in English"
    draft: Boolean!
  }

  input ExperienceInput {
    id: ID
    company: String!
    position: String!
    location: String!
    description: String
    start_date: String!
    end_date: String
  }

  type Mutation {
    "Creates the experiences in English"
    addExperiencesToTeamMember(teamMemberId: ID!, input: [ExperienceInput]!): [ID]
    "Saves the experiences' content in the language, English by default. English also saves their shared fields; other languages leave English and the shared fields as they are"
    updateExperiences(input: [ExperienceInput]!, language: String): Boolean
    removeExperiences(ids: [ID]!): Boolean
    linkUploadToExperienceLogo(key: ID!, experienceId: ID!): Boolean
  }
`
