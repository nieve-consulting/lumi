export const handoffTypeDefs = /* GraphQL */ `
  "How the enquiry form treats one contact field"
  type EnquiryFieldSetting {
    "name, email, phone or company"
    field: String!
    "off, optional or required"
    mode: String!
  }

  input EnquiryFieldSettingInput {
    field: String!
    mode: String!
  }

  "Where visitors book a meeting"
  type BookingSetting {
    "none, link (an external booking page) or calendar (the in-chat Google Calendar picker, see Appointment Settings)"
    type: String!
    "The booking page, for link"
    url: String
    "The booking button's text, for link. Null uses the chat's own"
    label: String
  }

  input BookingSettingInput {
    type: String!
    url: String
    label: String
  }

  "A delivery channel that sends each enquiry to the team, as admins see it: the webhook secret is never returned"
  type DeliveryChannel {
    "Stays the same across edits, so an enquiry's deliveries are tracked per channel"
    key: ID!
    "email or webhook"
    type: String!
    "For email"
    recipients: [String!]
    "For webhook"
    url: String
    "For webhook: whether a signing secret is saved"
    hasSecret: Boolean!
  }

  "A channel as admins send it. A new channel has no key. A webhook without a secret keeps the secret saved for its key"
  input DeliveryChannelInput {
    key: ID
    type: String!
    recipients: [String!]
    url: String
    secret: String
  }

  "The qualification and handoff settings, with the delivery channels redacted. Admins only"
  type HandoffSettings {
    "Asked naturally during conversations before the handoff is suggested; the answers go with the enquiry"
    qualificationQuestions: [String!]!
    "Every enquiry field, in the order the form shows them"
    enquiryFields: [EnquiryFieldSetting!]!
    booking: BookingSetting!
    "Whether visitors can send an enquiry from the chat. Enquiries are offered only while at least one channel is set up"
    enquiryEnabled: Boolean!
    channels: [DeliveryChannel!]!
    "The channel types this server can deliver with: email only when its sender is configured (EMAIL_FROM)"
    availableChannelTypes: [String!]!
    "Null until the settings are first saved, while the defaults apply"
    updatedAt: String
  }

  "Every setting. Null takes the default. An invalid input fails with BAD_USER_INPUT and extensions.problems, a list of { field, message } such as channels.1.url"
  input HandoffSettingsInput {
    qualificationQuestions: [String!]
    enquiryFields: [EnquiryFieldSettingInput!]
    booking: BookingSettingInput
    enquiryEnabled: Boolean
    channels: [DeliveryChannelInput!]
  }

  type EnquiryContactValue {
    "name, email, phone or company"
    field: String!
    value: String!
  }

  type EnquiryAnswer {
    question: String!
    "Empty when the visitor left it out"
    answer: String!
  }

  "One channel's delivery of an enquiry"
  type EnquiryDelivery {
    channelKey: ID!
    "email or webhook"
    channelType: String!
    "pending, delivered or failed"
    status: String!
    attempts: Int!
    "Why the latest attempt failed"
    lastError: String
    deliveredAt: String
    updatedAt: String!
    "Where the channel sends to now (the recipients or the webhook's host), or null when the channel was removed"
    destination: String
  }

  "An enquiry a visitor sent from a conversation, with the contact fields the form asked for"
  type Enquiry {
    id: ID!
    "Made by the visitor's form: resending the same submission never creates a second enquiry"
    submissionId: ID!
    createdAt: String!
    "pending, delivered (every channel tried accepted it), partial (some did) or failed (none did)"
    status: String!
    contact: [EnquiryContactValue!]!
    qualification: [EnquiryAnswer!]!
    message: String
    topic: String
    deliveries: [EnquiryDelivery!]!
  }

  type Thread {
    "The enquiries sent from the conversation, newest first"
    enquiries: [Enquiry!]!
    "Whether an enquiry of the conversation is partial or failed, so the team must retry it or follow up"
    enquiryFailed: Boolean!
  }

  type Query {
    "The handoff settings, or their defaults until first saved. Admins only"
    handoffSettings: HandoffSettings!
  }

  type Mutation {
    "Replaces every handoff setting. Fails with BAD_USER_INPUT listing the problems. Admins only"
    updateHandoffSettings(input: HandoffSettingsInput!): HandoffSettings!
    "Sends the enquiry again through each current channel that hasn't delivered it (every current channel when none has), and returns it with the new delivery states. Admins only"
    retryEnquiryDelivery(id: ID!): Enquiry!
  }
`
