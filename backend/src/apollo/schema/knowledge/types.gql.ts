export const knowledgeTypeDefs = /* GraphQL */ `
  "How the installation names a structured source, in English"
  type SourceLabel {
    singular: String!
    plural: String!
  }

  "Every structured source's label: those an admin saved, the defaults (Team member, Project, Client, Capability, Job opening) for the rest"
  type SourceLabels {
    teamMembers: SourceLabel!
    projects: SourceLabel!
    clients: SourceLabel!
    capabilities: SourceLabel!
    jobOpenings: SourceLabel!
  }

  "The structured sources the chat, the MCP server and the admin navigation use, and their labels"
  type KnowledgeSources {
    teamMembers: Boolean!
    projects: Boolean!
    clients: Boolean!
    capabilities: Boolean!
    jobOpenings: Boolean!
    labels: SourceLabels!
    "False until an admin saves them: until then a structured source is on when it has a published record, and capabilities when one is linked to a published team member or project while team members or projects are on"
    saved: Boolean!
  }

  "Trimmed, 1 to 40 characters each"
  input SourceLabelInput {
    singular: String!
    plural: String!
  }

  input SourceLabelsInput {
    teamMembers: SourceLabelInput!
    projects: SourceLabelInput!
    clients: SourceLabelInput!
    capabilities: SourceLabelInput!
    jobOpenings: SourceLabelInput!
  }

  input StructuredSourcesInput {
    teamMembers: Boolean!
    projects: Boolean!
    clients: Boolean!
    capabilities: Boolean!
    jobOpenings: Boolean!
    labels: SourceLabelsInput!
  }

  type Query {
    knowledgeSources: KnowledgeSources!
  }

  type Mutation {
    "Replaces the structured sources and their labels. Invalid labels fail with BAD_USER_INPUT and extensions.problems, a list of { field, message } such as labels.teamMembers.plural"
    updateStructuredSources(input: StructuredSourcesInput!): KnowledgeSources!
  }
`
