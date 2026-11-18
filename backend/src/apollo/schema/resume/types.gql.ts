export const resumeTypeDefs = /* GraphQL */ `
  "Whether Lumi offers team member resumes, and the logo, colours and footer text of the PDF, as entered (@lumi/shared-contracts/resume). Null fields are unset, so their default applies. Public: the web app renders them into the PDF"
  type ResumeSettings {
    "Whether Lumi offers resumes. While off, the chat, the admin and the MCP server don't link them and their URLs return not found"
    enabled: Boolean!
    "The logo in the resume's header band: an absolute URL or a path on the web app. Null shows the business name"
    logoUrl: String
    "The header and footer bands' background, lowercase #rrggbb. Null uses the neutral default"
    headerColor: String
    "Section headings, their dividers and the footer text, lowercase #rrggbb. Null uses the neutral default"
    accentColor: String
    "A second colour the footer text fades from into the accent colour, lowercase #rrggbb. Null shows the footer text in the accent colour"
    gradientColor: String
    "The text in the footer band, e.g. the website's address, linked to the business website when it has one. Null leaves the footer band out"
    footerText: String
    "Null until the settings are first saved, while the defaults apply (resumes on, neutral colours, no logo, no footer text)"
    updatedAt: String
  }

  "Every setting: those left null or empty are unset (cleared). An invalid input fails with BAD_USER_INPUT and extensions.problems, a list of { field, message } such as accentColor"
  input ResumeSettingsInput {
    enabled: Boolean!
    logoUrl: String
    headerColor: String
    accentColor: String
    gradientColor: String
    "At most 60 characters"
    footerText: String
  }

  type Query {
    "The resume settings, or their defaults until first saved"
    resumeSettings: ResumeSettings!
  }

  type Mutation {
    "Replaces every resume setting. Fails with BAD_USER_INPUT listing the problems. Admins only"
    updateResumeSettings(input: ResumeSettingsInput!): ResumeSettings!
  }
`
