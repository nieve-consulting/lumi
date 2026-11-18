export const jobOpeningsTypeDefs = /* GraphQL */ `
  type Query {
    "Job openings, most recently posted first, with their content in the language, English by default: one with no translation in it, or an outdated one (English changed after it was saved), is returned in English. missingLanguage keeps those with no translation in it, not even a draft. Only published job openings unless includeUnpublished"
    jobOpenings(language: String, missingLanguage: String, includeUnpublished: Boolean = false): [JobOpening]
    "The job opening with its content in the language, English by default, as jobOpenings returns it. An unpublished job opening is not found unless includeUnpublished"
    jobOpening(id: ID!, language: String, includeUnpublished: Boolean = false): JobOpening
    "The job opening with its content in the language, English by default, as jobOpenings returns it. An unpublished job opening is not found unless includeUnpublished"
    jobOpeningBySlug(url_slug: String!, language: String, includeUnpublished: Boolean = false): JobOpening
  }

  type JobOpening {
    id: ID!
    created_at: String!
    updated_at: String!
    url_slug: String!
    title: String!
    "One or two sentences about the role"
    summary: String!
    "The full description of the role (markdown)"
    description: String
    "Where the work is based, e.g. Madrid, Spain. Shared by every language"
    location: String!
    "REMOTE, HYBRID or ONSITE"
    work_mode: String!
    "Where candidates apply for this opening; without one, candidates are pointed to the careers page from the business settings"
    application_url: String
    "When the opening was posted, as an ISO 8601 date"
    posted_at: String!
    "Approved for external disclosure"
    published: Boolean!
    "Language the content was returned in: the requested one, or English when the job opening has no translation in it or an outdated one"
    language: String!
    "Content fields returned in English because the translation in language leaves them untranslated; empty when the whole record came back in language"
    fallback_fields: [String!]!
    "The job opening's content in every language it has, English first"
    translations: [JobOpeningTranslation!]!
  }

  "A job opening's content in one language, as saved. A null field is not translated in it and reads in English"
  type JobOpeningTranslation {
    title: String
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

  input JobOpeningInput {
    url_slug: String!
    title: String!
    summary: String!
    description: String
    location: String!
    "REMOTE, HYBRID or ONSITE"
    work_mode: String!
    application_url: String
    "ISO 8601 date"
    posted_at: String!
    published: Boolean
  }

  type Mutation {
    "Creates the job opening in English"
    createJobOpening(input: JobOpeningInput!): ID
    "Saves the job opening's content in the language, English by default. English also saves its shared fields; other languages leave English and the shared fields as they are"
    updateJobOpening(id: ID!, input: JobOpeningInput!, language: String): Boolean
    deleteJobOpening(id: ID!): Boolean
  }
`
