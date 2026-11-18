import { z } from "zod"

import { languageSchema } from "./language"

// How a conversation is handed to the business once the visitor wants to take it further: the qualification questions the
// assistant works into the conversation, the booking destination it offers, and the enquiry form with its contact fields
// and the delivery channels that send each enquiry to the team. Admins set them in Settings; the backend stores them as a
// single record next to the business settings (see business.ts).
//
// Everything but the delivery channels is public: the chat shows it in the handoff card. The channels hold destinations and
// signing secrets, so only the backend reads them and admins only see them redacted (see redactChannel). Until the record
// exists, or while nothing is enabled, the assistant offers the business's contact link instead (see contactHref)

// The contact fields an enquiry form can ask for, in the order the form shows them
export const ENQUIRY_FIELDS = ["name", "email", "phone", "company"] as const

export type EnquiryField = (typeof ENQUIRY_FIELDS)[number]

// The contact fields as the team reads them, in the admin interface and the enquiry emails (in English, like the rest of
// the team's interface)
export const ENQUIRY_FIELD_LABELS: Record<EnquiryField, string> = { name: "Name", email: "Email", phone: "Phone", company: "Company" }

export const FIELD_MODES = ["off", "optional", "required"] as const

export type FieldMode = (typeof FIELD_MODES)[number]

export type EnquiryFieldModes = Record<EnquiryField, FieldMode>

// The fields of a form the business hasn't customised: an email to reply to, a name and a phone if the visitor wants
export const DEFAULT_ENQUIRY_FIELDS: EnquiryFieldModes = { name: "optional", email: "required", phone: "optional", company: "off" }

export const MAX_QUALIFICATION_QUESTIONS = 8
export const MAX_QUESTION_LENGTH = 200
export const MAX_DELIVERY_CHANNELS = 5
export const MAX_EMAIL_RECIPIENTS = 10
export const MIN_WEBHOOK_SECRET_LENGTH = 16

// Longest values a visitor can send, in characters
export const ENQUIRY_LIMITS: Record<EnquiryField, number> & { answer: number; message: number } = {
  name: 100,
  email: 254,
  phone: 40,
  company: 120,
  answer: 1000,
  message: 4000,
}

export const BOOKING_TYPES = ["none", "link", "calendar"] as const

export type BookingType = (typeof BOOKING_TYPES)[number]

// Where visitors book a meeting: nowhere, an external booking page (only opened, never confirmed by Lumi), or the in-chat
// calendar picker that books in the team's Google Calendar (Appointment Settings)
export type Booking = { type: "none" } | { type: "link"; url: string; label?: string } | { type: "calendar" }

// The delivery plugins this release ships. The backend registers one channel implementation per type
export const DELIVERY_CHANNEL_TYPES = ["email", "webhook"] as const

export type DeliveryChannelType = (typeof DELIVERY_CHANNEL_TYPES)[number]

// The channel types as the team reads them in the admin interface
export const DELIVERY_CHANNEL_LABELS: Record<DeliveryChannelType, string> = { email: "Email", webhook: "Webhook" }

// A random version 4 UUID, for channel keys and enquiry submission ids. crypto.randomUUID only exists in secure contexts, so a
// page served over plain http (e.g. a self-hosted install on a local network) builds one from crypto.getRandomValues
export function randomUuid(): string {
  const { crypto } = globalThis
  if (typeof crypto.randomUUID === "function") return crypto.randomUUID()

  const bytes = crypto.getRandomValues(new Uint8Array(16))
  bytes[6] = (bytes[6] & 0x0f) | 0x40
  bytes[8] = (bytes[8] & 0x3f) | 0x80
  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("")
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
}

// A delivery channel as the backend stores it. The key stays the same across edits, so an enquiry's deliveries are tracked
// per channel and retrying one never sends it again where it was already delivered
export type DeliveryChannelConfig =
  { key: string; type: "email"; recipients: string[] } | { key: string; type: "webhook"; url: string; secret: string }

// A channel as admins see it: the webhook secret is never sent back, only whether one is saved
export type RedactedDeliveryChannel =
  { key: string; type: "email"; recipients: string[] } | { key: string; type: "webhook"; url: string; hasSecret: boolean }

export function redactChannel(channel: DeliveryChannelConfig): RedactedDeliveryChannel {
  return channel.type === "webhook" ? { key: channel.key, type: "webhook", url: channel.url, hasSecret: !!channel.secret } : channel
}

// A channel as admins send it. A new channel has no key; a webhook sent without a secret keeps the secret saved for its key
export type DeliveryChannelInput = {
  key?: string | null
  type: string
  recipients?: string[] | null
  url?: string | null
  secret?: string | null
}

// Every setting, as the admin settings send them. Null or undefined takes the default
export type HandoffSettingsInput = {
  qualificationQuestions?: string[] | null
  enquiryFields?: Partial<Record<string, string>> | null
  booking?: { type: string; url?: string | null; label?: string | null } | null
  enquiryEnabled?: boolean | null
  channels?: DeliveryChannelInput[] | null
}

// What the chat and the assistant's instructions may use
export type PublicHandoffConfig = {
  // Asked naturally during the conversation, before the handoff is suggested; answers go with the enquiry
  qualificationQuestions: string[]
  booking: Booking
  // Set only while enquiries are enabled and at least one delivery channel is set up
  enquiry?: { fields: EnquiryFieldModes }
}

export type HandoffConfig = { public: PublicHandoffConfig; channels: DeliveryChannelConfig[]; enquiryEnabled: boolean }

// An installation that hasn't set its handoff: no booking, no enquiries, so the assistant offers the contact link
export const DEFAULT_HANDOFF_CONFIG: HandoffConfig = {
  public: { qualificationQuestions: [], booking: { type: "none" } },
  channels: [],
  enquiryEnabled: false,
}

// Whether a conversation can be handed off at all, rather than only pointing the visitor to the contact link
export const hasHandoff = ({ booking, enquiry }: PublicHandoffConfig) => booking.type !== "none" || !!enquiry

// A problem with a setting, by its field ("channels.1.url", "enquiryFields.email"), so a form shows it next to the field
export type HandoffSettingsProblem = { field: string; message: string }

export class HandoffSettingsError extends Error {
  constructor(readonly problems: HandoffSettingsProblem[]) {
    super(`Invalid handoff settings:\n${problems.map(({ field, message }) => `- ${field}: ${message}`).join("\n")}`)
    this.name = "HandoffSettingsError"
  }
}

const trimmed = (value: unknown) => (typeof value === "string" ? value.trim() || undefined : value === null ? undefined : value)

const webUrl = z.url({ protocol: /^https?$/, error: "Enter a full web address starting with https://, e.g. https://cal.example.com/acme" })

// A webhook's address, held to what the backend's sender (safePost) delivers to, so a channel that can only fail can't be
// saved: the default https port, no credentials in the address, and a public host name. Private addresses that a name only
// resolves to are still caught when sending
const httpsUrl = z
  .url({ protocol: /^https$/, error: "Enter a full https:// address, e.g. https://hooks.example.com/lumi" })
  .superRefine((value, ctx) => {
    const url = new URL(value)
    const host = url.hostname.replace(/^\[|\]$/g, "")
    if (url.port && url.port !== "443") {
      ctx.addIssue({ code: "custom", message: "Use the standard https port: remove the port from the address, or use :443" })
    } else if (url.username || url.password) {
      ctx.addIssue({ code: "custom", message: "Remove the username and password from the address: Lumi signs each request instead" })
    } else if (host === "localhost" || host.endsWith(".localhost") || !(host.includes(".") || host.includes(":"))) {
      ctx.addIssue({ code: "custom", message: "Use a public address: Lumi can't reach local or internal hosts" })
    }
  })

const email = z.email("Enter an email address, e.g. sales@example.com")

const fieldMode = z.enum(FIELD_MODES, { error: `Choose one of ${FIELD_MODES.join(", ")}` })

const settingsSchema = z.object({
  qualificationQuestions: z
    .preprocess(
      (value) => (Array.isArray(value) ? value.map(trimmed).filter((question) => question !== undefined) : (value ?? undefined)),
      z.array(z.string().max(MAX_QUESTION_LENGTH, `Too long: at most ${MAX_QUESTION_LENGTH} characters`)).max(MAX_QUALIFICATION_QUESTIONS, {
        error: `At most ${MAX_QUALIFICATION_QUESTIONS} questions`,
      })
    )
    .optional(),
  enquiryFields: z.preprocess((value) => value ?? undefined, z.partialRecord(z.enum(ENQUIRY_FIELDS), fieldMode).optional()),
  booking: z.preprocess(
    (value) => value ?? undefined,
    z
      .object({
        type: z.enum(BOOKING_TYPES, { error: `Choose one of ${BOOKING_TYPES.join(", ")}` }),
        url: z.preprocess(trimmed, z.string().optional()),
        label: z.preprocess(trimmed, z.string().max(40, "Too long: at most 40 characters").optional()),
      })
      .optional()
  ),
  enquiryEnabled: z.preprocess((value) => value ?? undefined, z.boolean().optional()),
  channels: z.preprocess(
    (value) => value ?? undefined,
    z
      .array(
        z.object({
          key: z.preprocess(trimmed, z.string().max(64).optional()),
          type: z.enum(DELIVERY_CHANNEL_TYPES, { error: `Choose one of ${DELIVERY_CHANNEL_TYPES.join(", ")}` }),
          recipients: z.preprocess(
            (value) => (Array.isArray(value) ? value.map(trimmed).filter((recipient) => recipient !== undefined) : (value ?? undefined)),
            z.array(z.string()).optional()
          ),
          url: z.preprocess(trimmed, z.string().optional()),
          secret: z.preprocess(trimmed, z.string().optional()),
        })
      )
      .max(MAX_DELIVERY_CHANNELS, `At most ${MAX_DELIVERY_CHANNELS} delivery channels`)
      .optional()
  ),
})

export type ParseHandoffOptions = {
  // The channels saved so far, so a webhook sent without a secret keeps its saved one
  savedChannels?: DeliveryChannelConfig[]
  // Gives a new channel its key
  newKey?: () => string
}

const issueProblems = (issues: z.core.$ZodIssue[], prefix: string): HandoffSettingsProblem[] =>
  issues.map((issue) => ({ field: [prefix, ...issue.path.map(String)].filter(Boolean).join("."), message: issue.message }))

// Checks the settings and splits them into the public handoff and the server-only channels. Throws a HandoffSettingsError
// listing every problem by field. The backend checks what it stores and what it reads with it, so the chat, the agent and
// the delivery always see the same configuration
export function parseHandoffSettings(input: unknown, { savedChannels = [], newKey = randomUuid }: ParseHandoffOptions = {}): HandoffConfig {
  const result = settingsSchema.safeParse(input ?? {})
  if (!result.success) throw new HandoffSettingsError(issueProblems(result.error.issues, ""))

  const { data } = result
  const problems: HandoffSettingsProblem[] = []
  const check = <T>(schema: z.ZodType<T>, value: unknown, field: string): T | undefined => {
    const parsed = schema.safeParse(value)
    if (parsed.success) return parsed.data
    problems.push(...issueProblems(parsed.error.issues, field))
    return undefined
  }

  let booking: Booking = { type: "none" }
  if (data.booking?.type === "link") {
    if (!data.booking.url) problems.push({ field: "booking.url", message: "Enter the address of your booking page" })
    const url = data.booking.url ? check(webUrl, data.booking.url, "booking.url") : undefined
    booking = { type: "link", url: url ?? "", ...(data.booking.label ? { label: data.booking.label } : {}) }
  } else if (data.booking?.type === "calendar") {
    booking = { type: "calendar" }
  }

  const fields: EnquiryFieldModes = { ...DEFAULT_ENQUIRY_FIELDS, ...data.enquiryFields }
  const enquiryEnabled = data.enquiryEnabled ?? false

  const keys = new Set<string>()
  const channels = (data.channels ?? []).flatMap((channel, index): DeliveryChannelConfig[] => {
    const field = `channels.${index}`
    let key = channel.key && !keys.has(channel.key) ? channel.key : newKey()
    while (keys.has(key)) key = newKey()
    keys.add(key)

    if (channel.type === "email") {
      const recipients = [...new Set((channel.recipients ?? []).map((recipient) => recipient.toLowerCase()))]
      if (!recipients.length) problems.push({ field: `${field}.recipients`, message: "Add at least one recipient" })
      if (recipients.length > MAX_EMAIL_RECIPIENTS) {
        problems.push({ field: `${field}.recipients`, message: `At most ${MAX_EMAIL_RECIPIENTS} recipients` })
      }
      recipients.forEach((recipient, recipientIndex) => check(email, recipient, `${field}.recipients.${recipientIndex}`))
      return [{ key, type: "email", recipients }]
    }

    if (!channel.url) problems.push({ field: `${field}.url`, message: "Enter the address enquiries are sent to" })
    else check(httpsUrl, channel.url, `${field}.url`)

    const saved = savedChannels.find((candidate) => candidate.key === channel.key && candidate.type === "webhook")
    const secret = channel.secret ?? (saved?.type === "webhook" ? saved.secret : undefined)
    if (!secret) {
      problems.push({ field: `${field}.secret`, message: `Enter a signing secret of at least ${MIN_WEBHOOK_SECRET_LENGTH} characters` })
    } else if (secret.length < MIN_WEBHOOK_SECRET_LENGTH || secret.length > 200) {
      problems.push({ field: `${field}.secret`, message: `Use ${MIN_WEBHOOK_SECRET_LENGTH} to 200 characters` })
    }
    return [{ key, type: "webhook", url: channel.url ?? "", secret: secret ?? "" }]
  })

  if (enquiryEnabled) {
    if (!channels.length) problems.push({ field: "channels", message: "Add a delivery channel so enquiries reach your team" })
    if (fields.email !== "required" && fields.phone !== "required") {
      problems.push({ field: "enquiryFields.email", message: "Require an email or a phone number, so your team can reply" })
    }
  }

  if (problems.length) throw new HandoffSettingsError(problems)

  return {
    public: {
      qualificationQuestions: data.qualificationQuestions ?? [],
      booking,
      ...(enquiryEnabled && channels.length ? { enquiry: { fields } } : {}),
    },
    channels,
    enquiryEnabled,
  }
}

// What the handoff card the assistant shows carries. Saved on the thread with the message, so the enquiry is checked
// against the fields and questions the visitor was shown
export type HandoffCardPayload = {
  threadId: string
  // The assistant message the card is on, replaced by the confirmation once the enquiry is delivered
  messageId: string
  // The booking page, when the business books through one
  booking?: { url: string; label?: string }
  enquiry?: {
    fields: EnquiryFieldModes
    // Prefilled from the conversation: the visitor reviews and corrects them before sending
    values: Partial<Record<EnquiryField, string>>
    // The business's questions, each with the answer the conversation gave or an empty one
    qualification: { question: string; answer: string }[]
    // What the visitor wants to discuss, summarised from the conversation
    message: string
    topic?: string
  }
}

export type EnquiryValidationMessages = {
  required: string
  invalidEmail: string
  invalidPhone: string
  tooLong: (max: number) => string
}

// In English: the backend's checks and the chat's English text (frontend i18n) both use them
export const DEFAULT_ENQUIRY_MESSAGES: EnquiryValidationMessages = {
  required: "Required",
  invalidEmail: "Enter an email address, e.g. name@example.com",
  invalidPhone: "Enter a phone number with 6 to 15 digits, e.g. +34 610 096 740",
  tooLong: (max) => `Too long: at most ${max} characters`,
}

function fieldSchema(field: EnquiryField, messages: EnquiryValidationMessages) {
  const base = z.string().trim().max(ENQUIRY_LIMITS[field], messages.tooLong(ENQUIRY_LIMITS[field]))
  switch (field) {
    case "email":
      return base.pipe(z.union([z.literal(""), z.email(messages.invalidEmail)]))
    case "phone":
      return base.refine((phone) => {
        if (!phone) return true
        const digits = phone.replace(/\D/g, "").length
        return /^\+?[\d\s().-]+$/.test(phone) && digits >= 6 && digits <= 15
      }, messages.invalidPhone)
    default:
      return base
  }
}

// The visitor's details as the enquiry form sends them, built from the fields the card showed: only those fields are kept,
// required ones must be filled in, and empty optional ones are left out. Validation messages are in the chat's language
export function enquiryDataSchema(fields: EnquiryFieldModes, questionCount: number, messages: EnquiryValidationMessages = DEFAULT_ENQUIRY_MESSAGES) {
  const contact = Object.fromEntries(
    ENQUIRY_FIELDS.filter((field) => fields[field] !== "off").map((field) => {
      const schema = fieldSchema(field, messages)
      return [
        field,
        fields[field] === "required"
          ? schema.refine((value) => value.length > 0, messages.required)
          : z.preprocess((value) => value ?? "", schema).transform((value) => value || undefined),
      ]
    })
  ) as Record<string, z.ZodType>

  return z.object({
    contact: z.object(contact),
    // One answer per question of the card, in its order; an empty answer means the visitor left it out
    answers: z.array(z.string().trim().max(ENQUIRY_LIMITS.answer, messages.tooLong(ENQUIRY_LIMITS.answer))).length(questionCount),
    message: z.string().trim().max(ENQUIRY_LIMITS.message, messages.tooLong(ENQUIRY_LIMITS.message)),
  }) as unknown as z.ZodType<EnquiryData>
}

export type EnquiryData = { contact: Partial<Record<EnquiryField, string>>; answers: string[]; message: string }

// POST /agents/pre-sales/enquiry. The submission id is made by the form and kept while the visitor retries, so sending the
// same enquiry again never creates a second one. The data is checked against the handoff card of the message
export const enquiryRequestSchema = z.object({
  threadId: z.uuid().toLowerCase(),
  messageId: z.string().min(1).max(200),
  submissionId: z.uuid().toLowerCase(),
  data: z.object({
    contact: z.record(z.string(), z.string().max(1000)),
    answers: z.array(z.string().max(ENQUIRY_LIMITS.answer * 2)).max(MAX_QUALIFICATION_QUESTIONS),
    message: z.string().max(ENQUIRY_LIMITS.message * 2),
  }),
  // The chat's language, for the confirmation saved on the thread
  language: languageSchema,
})

export type EnquiryRequest = z.input<typeof enquiryRequestSchema>

// 200 when at least one delivery channel accepted the enquiry: the thread is closed and the card replaced by a confirmation.
// replyTo is where the team will reply as the delivered enquiry has it (its email, else its phone, else null), which can
// differ from what the visitor just sent when an earlier delivery already reached the team. 502 with "failed" when none did:
// the enquiry is saved for the team to retry, the thread stays open and the visitor may try again with the same submission
// id. 400 lists the problems with the data by field. 404 when the thread or the card's form isn't known, which no resend fixes
export type EnquiryResponse =
  { status: "delivered"; replyTo: string | null } | { status: "failed" } | { error: string; problems?: HandoffSettingsProblem[] }

// How an enquiry stands: delivered when every channel tried accepted it, partial when some did, failed when none did,
// pending while it is being sent
export const ENQUIRY_STATUSES = ["pending", "delivered", "partial", "failed"] as const

export type EnquiryStatus = (typeof ENQUIRY_STATUSES)[number]

export const DELIVERY_STATUSES = ["pending", "delivered", "failed"] as const

export type DeliveryStatus = (typeof DELIVERY_STATUSES)[number]

export function enquiryStatus(deliveries: { status: DeliveryStatus }[]): EnquiryStatus {
  if (!deliveries.length || deliveries.some(({ status }) => status === "pending")) return "pending"
  const delivered = deliveries.filter(({ status }) => status === "delivered").length
  if (delivered === deliveries.length) return "delivered"
  return delivered ? "partial" : "failed"
}
