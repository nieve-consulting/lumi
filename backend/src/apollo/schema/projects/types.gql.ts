export const projectsTypeDefs = /* GraphQL */ `
  type Query {
    "Projects with their content in the language, English by default, and their nested records too: one with no translation in it, or an outdated one (English changed after it was saved), is returned in English. missingLanguage keeps those with content left to translate into it: the project has no translation in it, not even a draft, or one of its team member contributions with English text has none. Only published projects unless includeUnpublished"
    projects(language: String, missingLanguage: String, includeUnpublished: Boolean = false): [Project]
    "The project with its content in the language, English by default, as projects returns it. An unpublished project is not found unless includeUnpublished"
    project(id: ID!, language: String, includeUnpublished: Boolean = false): Project
    "The project with its content in the language, English by default, as projects returns it. An unpublished project is not found unless includeUnpublished"
    projectBySlug(url_slug: String!, language: String, includeUnpublished: Boolean = false): Project
  }

  type TeamMemberInProject {
    teamMember: TeamMember
    description: String
    start_date: String!
    end_date: String
    "Language the contribution's content was returned in: the requested one, or English when it has no translation in it or an outdated one"
    language: String!
    "Content fields returned in English because the translation in language leaves them untranslated; empty when the whole record came back in language"
    fallback_fields: [String!]!
    "The contribution's content in every language it has, English first"
    translations: [ProjectContributionTranslation!]!
  }

  "A team member's contribution to a project in one language, as saved. A null field is not translated in it and reads in English"
  type ProjectContributionTranslation {
    description: String
    language: String!
    "When the content was last saved in this language"
    updated_at: String!
    "English changed since this translation was saved, so it may need reviewing. Always false in English"
    outdated: Boolean!
    "An AI translation saved for review: reads skip it and return English until the team saves the translation. Always false in English"
    draft: Boolean!
  }

  type Project {
    id: ID!
    created_at: String!
    updated_at: String!
    start_date: String!
    url_slug: String!
    name: String!
    location: String!
    end_date: String
    webpage: String
    summary: String
    industry: String
    type: String
    image_key: ID
    description: String
    "Approved for external disclosure"
    published: Boolean!
    "The project's client, or null when it is unpublished unless includeUnpublished"
    client(includeUnpublished: Boolean = false): Client
    "Contributions of published team members; includeUnpublished adds those of unpublished ones, such as people who left the business"
    teamMembers(includeUnpublished: Boolean = false): [TeamMemberInProject]
    capabilities: [Capability]
    "Language the content was returned in: the requested one, or English when the project has no translation in it or an outdated one"
    language: String!
    "Content fields returned in English because the translation in language leaves them untranslated; empty when the whole record came back in language"
    fallback_fields: [String!]!
    "The project's content in every language it has, English first"
    translations: [ProjectTranslation!]!
  }

  "A project's content in one language, as saved. A null field is not translated in it and reads in English"
  type ProjectTranslation {
    name: String
    summary: String
    description: String
    industry: String
    type: String
    language: String!
    "When the content was last saved in this language"
    updated_at: String!
    "English changed since this translation was saved, so it may need reviewing. Always false in English"
    outdated: Boolean!
    "An AI translation saved for review: reads skip it and return English until the team saves the translation. Always false in English"
    draft: Boolean!
  }

  input ProjectInput {
    start_date: String!
    url_slug: String!
    name: String!
    location: String!
    end_date: String
    summary: String
    webpage: String
    description: String
    industry: String
    type: String
    client_id: ID
    published: Boolean
  }

  input ProjectTeamMemberInput {
    team_member_id: ID!
    start_date: String!
    description: String
    end_date: String
  }

  type Mutation {
    "Creates the project in English"
    createProject(input: ProjectInput!): ID
    "Saves the project's content in the language, English by default. English also saves its shared fields; other languages leave English and the shared fields as they are"
    updateProject(id: ID!, input: ProjectInput!, language: String): Boolean
    deleteProject(id: ID!): Boolean
    addTeamMembersToProject(projectId: ID!, teamMembers: [ProjectTeamMemberInput!]!): Boolean
    "Saves the contributions' descriptions in the language, English by default. English also saves their dates; other languages leave English and the dates as they are"
    updateProjectTeamMember(projectId: ID!, teamMembers: [ProjectTeamMemberInput!]!, language: String): Boolean
    removeTeamMembersFromProject(projectId: ID!, teamMemberIds: [ID!]!): Boolean
    linkUploadToProjectImage(key: ID!, projectId: ID!): Boolean
  }
`
