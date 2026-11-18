export const businessTypeDefs = /* GraphQL */ `
  "Text in one language"
  type LocalizedText {
    language: String!
    text: String!
  }

  input LocalizedTextInput {
    language: String!
    text: String!
  }

  "A suggested first message the chat offers before the conversation starts, as the business set it"
  type BusinessStarter {
    "One of the starter icons in @lumi/shared-contracts/business, or null for none"
    icon: String
    "The text by language: the default language's is always there, the others fall back to it"
    label: [LocalizedText!]!
    "Sent as the visitor's first message"
    message: [LocalizedText!]!
  }

  input BusinessStarterInput {
    icon: String
    label: [LocalizedTextInput!]!
    message: [LocalizedTextInput!]!
  }

  "Every business setting as entered, for the onboarding wizard and the admin settings. Null fields are unset, so their default applies. Includes the server-only agent fields: admins only"
  type BusinessSettings {
    businessName: String!
    websiteUrl: String
    careersUrl: String
    contactUrl: String
    contactEmail: String
    contactPhone: String
    assistantName: String
    avatarUrl: String
    logoUrl: String
    "Lowercase #rrggbb"
    primaryColor: String
    defaultLanguage: String
    "Null shows the chat's built-in starters, an empty list none"
    starters: [BusinessStarter!]
    "The assistant's first message by language: the default language's is always there, the others fall back to it. Null uses the built-in greeting"
    greeting: [LocalizedText!]
    "Server-only: what the business provides, in the agent's instructions"
    agentDescription: String
    "Server-only: extra instructions for every conversation"
    agentGuidance: String
    updatedAt: String!
  }

  "The business settings visitors may see: BusinessSettings without the agent fields"
  type PublicBusinessSettings {
    businessName: String!
    websiteUrl: String
    careersUrl: String
    contactUrl: String
    contactEmail: String
    contactPhone: String
    assistantName: String
    avatarUrl: String
    logoUrl: String
    primaryColor: String
    defaultLanguage: String
    starters: [BusinessStarter!]
    greeting: [LocalizedText!]
    updatedAt: String!
  }

  "Every setting: those left null or empty are unset (cleared on an update). An invalid input fails with BAD_USER_INPUT and extensions.problems, a list of { field, message } such as starters.1.label.es or greeting.en"
  input BusinessSettingsInput {
    businessName: String!
    websiteUrl: String
    careersUrl: String
    contactUrl: String
    contactEmail: String
    contactPhone: String
    assistantName: String
    avatarUrl: String
    logoUrl: String
    primaryColor: String
    defaultLanguage: String
    starters: [BusinessStarterInput!]
    "Null or no text keeps the built-in greeting"
    greeting: [LocalizedTextInput!]
    agentDescription: String
    agentGuidance: String
  }

  type Query {
    "The public business settings, or null until the installation is set up"
    publicBusinessSettings: PublicBusinessSettings
    "Every business setting, agent fields included, or null until the installation is set up. Admins only"
    businessSettings: BusinessSettings
  }

  type Mutation {
    "Sets the installation up from the onboarding wizard: saves the business settings when none exist yet, and with firstAdmin creates that admin account in the same transaction. Fails with ALREADY_SET_UP once set up, ADMIN_EXISTS (nothing saved) when firstAdmin is given but an admin account exists, or BAD_USER_INPUT listing the problems with the settings and firstAdmin"
    setupBusiness(input: BusinessSettingsInput!, firstAdmin: FirstAdminInput): BusinessSettings!
    "Replaces every business setting. Fails with NOT_SET_UP before the setup, or BAD_USER_INPUT. Admins only"
    updateBusinessSettings(input: BusinessSettingsInput!): BusinessSettings!
  }
`
