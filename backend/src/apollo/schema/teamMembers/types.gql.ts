export const teamMembersTypeDefs = /* GraphQL */ `
  type Query {
    "Team members with their content in the language, English by default, and their nested records too: one with no translation in it, or an outdated one (English changed after it was saved), is returned in English. missingLanguage keeps those with content left to translate into it: the team member has no translation in it, not even a draft, or one of their work experiences with English text has none. Only published team members unless includeUnpublished"
    teamMembers(language: String, missingLanguage: String, includeUnpublished: Boolean = false): [TeamMember]
    "The team member with their content in the language, English by default, as teamMembers returns it. An unpublished team member is not found unless includeUnpublished"
    teamMember(id: ID!, language: String, includeUnpublished: Boolean = false): TeamMember
    "The team member with their content in the language, English by default, as teamMembers returns it. An unpublished team member is not found unless includeUnpublished"
    teamMemberBySlug(url_slug: String!, language: String, includeUnpublished: Boolean = false): TeamMember
    "A team member's profile as approved for public disclosure, or null when the team member is not published. Its content is in the language, English by default, as teamMembers returns it"
    publicTeamMember(id: ID!, language: String): PublicTeamMemberProfile
  }

  "Public profile: only public project contributions and public clients"
  type PublicTeamMemberProfile {
    id: ID!
    name: String!
    job_title: String!
    bio: String
    education: String
    capability_highlights: String
    webpage: String
    profile_photo_url: String
    experiences: [PublicExperience!]!
    capabilities: [PublicTeamMemberCapability!]!
    project_contributions: [PublicProjectContribution!]!
    "Language the profile's content was returned in: the requested one, or English when the team member has no translation in it or an outdated one"
    language: String!
    "Content fields returned in English because the translation in language leaves them untranslated; empty when the whole record came back in language"
    fallback_fields: [String!]!
  }

  type PublicExperience {
    company: String!
    position: String!
    location: String!
    start_date: String!
    end_date: String
    description: String
    logo_url: String
    "Language the experience's content was returned in: the requested one, or English when it has no translation in it or an outdated one"
    language: String!
    "Content fields returned in English because the translation in language leaves them untranslated; empty when the whole record came back in language"
    fallback_fields: [String!]!
  }

  type PublicTeamMemberCapability {
    name: String!
    stars: Int!
    "Language the capability's name was returned in: the requested one, or English when the capability has no translation in it or an outdated one"
    language: String!
    "Content fields returned in English because the translation in language leaves them untranslated; empty when the whole record came back in language"
    fallback_fields: [String!]!
  }

  type PublicProjectContribution {
    project: PublicContributionProject!
    description: String
    start_date: String!
    end_date: String
    "Language the contribution's description was returned in: the requested one, or English when it has no translation in it or an outdated one"
    language: String!
    "Content fields returned in English because the translation in language leaves them untranslated; empty when the whole record came back in language"
    fallback_fields: [String!]!
  }

  type PublicContributionProject {
    id: ID!
    name: String!
    "Null when the client is not public"
    client: PublicClientReference
    "Language the project's name was returned in: the requested one, or English when the project has no translation in it or an outdated one"
    language: String!
    "Content fields returned in English because the translation in language leaves them untranslated; empty when the whole record came back in language"
    fallback_fields: [String!]!
  }

  type PublicClientReference {
    id: ID!
    name: String!
    logo_url: String
  }

  type ProjectContribution {
    project: Project!
    start_date: String!
    description: String
    end_date: String
    "Language the contribution's content was returned in: the requested one, or English when it has no translation in it or an outdated one"
    language: String!
    "Content fields returned in English because the translation in language leaves them untranslated; empty when the whole record came back in language"
    fallback_fields: [String!]!
    "The contribution's content in every language it has, English first"
    translations: [ProjectContributionTranslation!]!
  }

  type TeamMember {
    id: ID!
    created_at: String!
    updated_at: String!
    name: String!
    url_slug: String!
    job_title: String!
    bio: String
    webpage: String
    education: String
    capability_highlights: String
    profile_photo_key: ID
    "Approved for external disclosure"
    published: Boolean!
    capabilities: [TeamMemberCapability]
    "Contributions to published projects; includeUnpublished adds those to unpublished ones"
    project_contributions(includeUnpublished: Boolean = false): [ProjectContribution]
    experiences: [Experience]
    "Language the content was returned in: the requested one, or English when the team member has no translation in it or an outdated one"
    language: String!
    "Content fields returned in English because the translation in language leaves them untranslated; empty when the whole record came back in language"
    fallback_fields: [String!]!
    "The team member's content in every language it has, English first"
    translations: [TeamMemberTranslation!]!
  }

  "A team member's content in one language, as saved. A null field is not translated in it and reads in English"
  type TeamMemberTranslation {
    job_title: String
    capability_highlights: String
    bio: String
    education: String
    language: String!
    "When the content was last saved in this language"
    updated_at: String!
    "English changed since this translation was saved, so it may need reviewing. Always false in English"
    outdated: Boolean!
    "An AI translation saved for review: reads skip it and return English until the team saves the translation. Always false in English"
    draft: Boolean!
  }

  input TeamMemberInput {
    name: String!
    job_title: String!
    published: Boolean
    url_slug: String!
    capability_highlights: String
    bio: String
    webpage: String
    education: String
  }

  type Mutation {
    "Creates the team member in English"
    createTeamMember(input: TeamMemberInput!): ID
    "Saves the team member's content in the language, English by default. English also saves its shared fields; other languages leave English and the shared fields as they are"
    updateTeamMember(id: ID!, input: TeamMemberInput!, language: String): Boolean
    deleteTeamMember(id: ID!): Boolean
    linkUploadToTeamMemberPhoto(key: ID!, teamMemberId: ID!): Boolean
  }
`
