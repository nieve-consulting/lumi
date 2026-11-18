export const translationDraftsTypeDefs = /* GraphQL */ `
  "A kind of record whose content is stored per language"
  enum TranslatedRecordType {
    CAPABILITY
    CLIENT
    EXPERIENCE
    JOB_OPENING
    PROJECT
    PROJECT_TEAM_MEMBER
    TEAM_MEMBER
  }

  "A translated content field, by its name in the record's translation type, e.g. bio"
  input TranslationFieldInput {
    field: String!
    "The translation"
    text: String!
    "The English text it was translated from, so a draft of English that changed meanwhile reads as outdated once published"
    source: String!
  }

  input TranslationDraftInput {
    type: TranslatedRecordType!
    "The record's id. For PROJECT_TEAM_MEMBER, the project's id"
    id: ID!
    "PROJECT_TEAM_MEMBER only: the team member's id"
    team_member_id: ID
    fields: [TranslationFieldInput!]!
  }

  type TranslationDraftsResult {
    "Items saved as drafts, those replacing an outdated translation included"
    saved: Int!
    "Fields of the saved items left untranslated, as their text was empty or longer than the field stores"
    untranslated: Int!
  }

  type Mutation {
    "Saves AI translations into the language as drafts for the team to review: reads skip a draft and return English until the team saves the translation. Each item is saved only when it has no translation in the language yet, so one saved meanwhile is never replaced, or with replaceOutdated, also when its translation is outdated"
    saveTranslationDrafts(
      language: String!
      drafts: [TranslationDraftInput!]!
      "Also replace a translation in the language, reviewed or a draft, that is outdated when saving (English changed after it was saved): it becomes the draft, its fields the draft leaves out keeping their text for review unless English has none. An up-to-date translation is always kept. False by default"
      replaceOutdated: Boolean
    ): TranslationDraftsResult!
  }
`
