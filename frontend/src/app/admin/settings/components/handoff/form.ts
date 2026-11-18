import type { HandoffSettingsInput as GraphQLHandoffSettingsInput, HandoffSettings } from "@/generated/graphql"
import {
  BOOKING_TYPES,
  DEFAULT_ENQUIRY_FIELDS,
  DELIVERY_CHANNEL_TYPES,
  ENQUIRY_FIELDS,
  FIELD_MODES,
  HandoffSettingsError,
  MIN_WEBHOOK_SECRET_LENGTH,
  parseHandoffSettings,
  type BookingType,
  type DeliveryChannelConfig,
  type DeliveryChannelType,
  type EnquiryFieldModes,
  type FieldMode,
  type HandoffSettingsInput,
  type HandoffSettingsProblem,
} from "@lumi/shared-contracts/handoff"

import type { FieldErrors } from "@/components/BusinessSettings/form"

// The handoff settings as the admin form edits them: every text box's value, and an id for each list entry so React keeps
// its fields while entries are moved or removed

export type QuestionForm = { id: string; text: string }

export type ChannelForm = {
  id: string
  // The saved channel's key, unset for a new one
  key?: string
  type: DeliveryChannelType
  // Email: one address per line
  recipients: string
  // Webhook
  url: string
  // Webhook: a new secret, or empty to keep the saved one
  secret: string
  hasSecret: boolean
}

export type HandoffForm = {
  questions: QuestionForm[]
  fields: EnquiryFieldModes
  bookingType: BookingType
  bookingUrl: string
  bookingLabel: string
  enquiryEnabled: boolean
  channels: ChannelForm[]
}

// Only React keys: never rendered, so they needn't match between the server and the browser
let lastId = 0
const newId = () => `entry-${++lastId}`

export const newQuestion = (): QuestionForm => ({ id: newId(), text: "" })

export const newChannel = (type: DeliveryChannelType): ChannelForm => ({ id: newId(), type, recipients: "", url: "", secret: "", hasSecret: false })

const oneOf = <T extends string>(values: readonly T[], value: string, fallback: T) => values.find((candidate) => candidate === value) ?? fallback

export function formFromSettings(settings: HandoffSettings): HandoffForm {
  const fields = { ...DEFAULT_ENQUIRY_FIELDS }
  for (const { field, mode } of settings.enquiryFields) {
    const known = ENQUIRY_FIELDS.find((candidate) => candidate === field)
    if (known) fields[known] = oneOf<FieldMode>(FIELD_MODES, mode, fields[known])
  }
  return {
    questions: settings.qualificationQuestions.map((text) => ({ id: newId(), text })),
    fields,
    bookingType: oneOf<BookingType>(BOOKING_TYPES, settings.booking.type, "none"),
    bookingUrl: settings.booking.url ?? "",
    bookingLabel: settings.booking.label ?? "",
    enquiryEnabled: settings.enquiryEnabled,
    channels: settings.channels.flatMap((channel): ChannelForm[] => {
      const type = DELIVERY_CHANNEL_TYPES.find((candidate) => candidate === channel.type)
      if (!type) return []
      return [
        {
          id: newId(),
          key: channel.key,
          type,
          recipients: (channel.recipients ?? []).join("\n"),
          url: channel.url ?? "",
          secret: "",
          hasSecret: channel.hasSecret,
        },
      ]
    }),
  }
}

// The addresses of an email channel, as the API keeps them: lower case, each once
export const recipientList = (text: string) => [
  ...new Set(
    text
      .split(/[\s,;]+/)
      .map((recipient) => recipient.trim().toLowerCase())
      .filter(Boolean)
  ),
]

// The settings to check, as parseHandoffSettings takes them
export function settingsFromForm(form: HandoffForm): HandoffSettingsInput {
  return {
    qualificationQuestions: form.questions.map(({ text }) => text.trim()).filter(Boolean),
    enquiryFields: form.fields,
    booking:
      form.bookingType === "link"
        ? { type: "link", url: form.bookingUrl.trim() || null, label: form.bookingLabel.trim() || null }
        : { type: form.bookingType },
    enquiryEnabled: form.enquiryEnabled,
    channels: form.channels.map((channel) =>
      channel.type === "email"
        ? { key: channel.key ?? null, type: "email", recipients: recipientList(channel.recipients) }
        : { key: channel.key ?? null, type: "webhook", url: channel.url.trim() || null, secret: channel.secret.trim() || null }
    ),
  }
}

// The settings as the updateHandoffSettings mutation takes them
export function graphQLInput(form: HandoffForm): GraphQLHandoffSettingsInput {
  const settings = settingsFromForm(form)
  return {
    qualificationQuestions: settings.qualificationQuestions,
    enquiryFields: ENQUIRY_FIELDS.map((field) => ({ field, mode: form.fields[field] })),
    booking: { type: form.bookingType, url: settings.booking?.url ?? null, label: settings.booking?.label ?? null },
    enquiryEnabled: settings.enquiryEnabled,
    channels: (settings.channels ?? []).map(({ key, type, recipients, url, secret }) =>
      type === "email" ? { key, type, recipients } : { key, type, url, secret }
    ),
  }
}

// Problems by the form's fields. Questions count without the empty ones the form leaves out, and an email channel's
// problem with one address goes to its recipients box, naming the address
export function errorsFromProblems(problems: HandoffSettingsProblem[], form: HandoffForm): FieldErrors {
  const questionIndexes = form.questions.flatMap(({ text }, index) => (text.trim() ? [index] : []))
  const errors: FieldErrors = {}
  for (const { field, message } of problems) {
    const question = /^qualificationQuestions\.(\d+)$/.exec(field)
    const recipient = /^channels\.(\d+)\.recipients\.(\d+)$/.exec(field)
    if (question) {
      errors[`qualificationQuestions.${questionIndexes[Number(question[1])] ?? question[1]}`] ??= message
    } else if (recipient) {
      const address = recipientList(form.channels[Number(recipient[1])]?.recipients ?? "")[Number(recipient[2])]
      errors[`channels.${recipient[1]}.recipients`] ??= address ? `${address}: ${message}` : message
    } else {
      errors[field] ??= message
    }
  }
  return errors
}

// Every problem with the form, as the API would report them. Saved webhook secrets aren't sent to the form, so a webhook
// that has one counts as keeping it
export function validateForm(form: HandoffForm): FieldErrors {
  const savedChannels: DeliveryChannelConfig[] = form.channels.flatMap((channel) =>
    channel.key && channel.type === "webhook" && channel.hasSecret
      ? [{ key: channel.key, type: "webhook" as const, url: channel.url, secret: "x".repeat(MIN_WEBHOOK_SECRET_LENGTH) }]
      : []
  )
  try {
    parseHandoffSettings(settingsFromForm(form), { savedChannels })
    return {}
  } catch (error) {
    if (error instanceof HandoffSettingsError) return errorsFromProblems(error.problems, form)
    throw error
  }
}

// A random signing secret for a webhook: 32 bytes as hex
export function generateSecret() {
  return Array.from(globalThis.crypto.getRandomValues(new Uint8Array(32)), (byte) => byte.toString(16).padStart(2, "0")).join("")
}
