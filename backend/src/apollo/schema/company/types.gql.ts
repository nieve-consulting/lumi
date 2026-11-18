export const companyTypeDefs = /* GraphQL */ `
  type Query {
    "The company with its content in the language, English by default: with no translation in it, or an outdated one (English changed after it was saved), it is returned in English. Null until the company is first saved"
    company(language: String): Company
  }
  type Company {
    location: String!
    phone: String!
    email: String!
    founding_story: String
    values: String
    vision: String
    mission: String
    webpage: String
    "Language the content was returned in: the requested one, or English when the company has no translation in it or an outdated one"
    language: String!
    "Content fields returned in English because the translation in language leaves them untranslated; empty when the whole record came back in language"
    fallback_fields: [String!]!
    "The company's content in every language it has, English first"
    translations: [CompanyTranslation!]!
  }

  "The company's content in one language, as saved. A null field is not translated in it and reads in English"
  type CompanyTranslation {
    founding_story: String
    values: String
    vision: String
    mission: String
    language: String!
    "When the content was last saved in this language"
    updated_at: String!
    "English changed since this translation was saved, so it may need reviewing. Always false in English"
    outdated: Boolean!
    "An AI translation saved for review: reads skip it and return English until the team saves the translation. Always false in English"
    draft: Boolean!
  }

  input CompanyInput {
    location: String!
    phone: String!
    email: String!
    founding_story: String
    values: String
    vision: String
    mission: String
    webpage: String
  }

  type Mutation {
    "Saves the company's content in the language, English by default. English also saves its shared fields; other languages need English saved first and leave English and the shared fields as they are"
    updateCompany(input: CompanyInput!, language: String): Boolean
  }
`
