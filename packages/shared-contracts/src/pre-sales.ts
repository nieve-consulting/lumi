import { z } from "zod"

import type { PublicBusinessConfig } from "./business"
import type { LumiMessage } from "./chat"
import { ENQUIRY_LIMITS } from "./handoff"
import { languageSchema, type Language } from "./language"

// Request and response bodies of the pre-sales agent routes on the agents API

// Why the public routes refused a request, in the error body as `code`, so the chat can tell the visitor what happened and
// what to do instead of a generic failure. The limits:
// - rate_limited (429): too many requests from the visitor's address; try again after retryAfterSeconds
// - thread_limit (409): the conversation reached its message limit; start a new one
// - thread_closed (409): the conversation ended with a booking or enquiry; start a new one
// - unavailable (503): the installation's daily spending limit was reached; contact the business another way
export const LIMIT_CODES = ["rate_limited", "thread_limit", "thread_closed", "unavailable"] as const

export type LimitCode = (typeof LIMIT_CODES)[number]

// And slot_unavailable (400): the booking's time isn't free any more, or is now too soon or too far ahead; pick another
export const SLOT_UNAVAILABLE = "slot_unavailable"

export type AgentsErrorCode = LimitCode | typeof SLOT_UNAVAILABLE

const ERROR_CODES: readonly AgentsErrorCode[] = [...LIMIT_CODES, SLOT_UNAVAILABLE]

// The body of every error answer of the agents API. Only refusals the chat explains carry a code
export type AgentsErrorResponse = {
  error: string
  code?: AgentsErrorCode
  retryAfterSeconds?: number
}

// The code of an error body, e.g. the text an AI SDK transport puts in its Error's message, or of an object with a code, or
// undefined
export function errorCodeOf(body: unknown): AgentsErrorCode | undefined {
  let value = body
  if (typeof value === "string") {
    try {
      value = JSON.parse(value)
    } catch {
      return undefined
    }
  }
  const code = (value as { code?: unknown } | null)?.code
  return ERROR_CODES.find((known) => known === code)
}

// The limit code of an error body or an object with a code, or undefined
export function limitCodeOf(body: unknown): LimitCode | undefined {
  const code = errorCodeOf(body)
  return LIMIT_CODES.find((known) => known === code)
}

// Thread ids are the threads.id uuids. Postgres matches a uuid in any case but the checkpointer keys threads by the id as text,
// so ids are lowercased to read and write the same checkpoints as the canonical uuid::text
export const threadIdSchema = z.uuid().toLowerCase()

export const meetingDataSchema = z.object({
  name: z.string().optional().describe("The name of the human"),
  email: z.string().email().describe("The email of the human"),
  phone: z.string().optional().describe("The phone number of the human"),
  summary: z.string().describe("The summary of the conversation"),
  topic: z.string().describe("The topic of the conversation"),
})

export type MeetingDataType = z.infer<typeof meetingDataSchema>

// The assistant's first message when the business sets none, in each language, introducing it by the installation's
// assistant name. Generic, so it suits any business and promises nothing a source that is off can't answer
const DEFAULT_GREETINGS: Record<Language, (assistantName: string) => string> = {
  en: (name) =>
    `Hello! I'm ${name}, here to understand your needs and tell you about what we do. I can also help you get in touch with our team. How can I help you today?`,
  es: (name) =>
    `¡Hola! Soy ${name}. Estoy aquí para entender lo que necesitas y contarte a qué nos dedicamos. También puedo ayudarte a ponerte en contacto con nuestro equipo. ¿En qué puedo ayudarte?`,
}

// The assistant's first message in the language: the business's greeting (see PublicBusinessConfig), or the default one.
// The chat shows it before a thread exists, and the agents API seeds every new thread with it so clients can only choose the
// language, not what the assistant said
export function greeting(language: Language, business: Pick<PublicBusinessConfig, "assistantName" | "greeting">) {
  return business.greeting?.[language] ?? DEFAULT_GREETINGS[language](business.assistantName)
}

// Longest visitor message, in characters. Both chat surfaces keep longer drafts and ask the visitor to shorten them before sending
export const MAX_MESSAGE_LENGTH = 4000

// Counts code points rather than UTF-16 units, so an emoji or a character outside the Basic Multilingual Plane counts once
export const countCharacters = (text: string) => text.length - (text.match(/[\uD800-\uDBFF][\uDC00-\uDFFF]/g)?.length ?? 0)

const MAX_PAGE_TITLE_LENGTH = 300

// POST /agents/pre-sales: runs one chat turn and answers with an AI SDK UI message stream
export const turnRequestSchema = z.object({
  message: z
    .string()
    .min(1)
    .refine((message) => countCharacters(message) <= MAX_MESSAGE_LENGTH, `Too long: expected at most ${MAX_MESSAGE_LENGTH} characters`),
  threadId: threadIdSchema,
  // Taken from the host page, so a long title is shortened rather than rejected
  pageTitle: z
    .string()
    .transform((title) => title.slice(0, MAX_PAGE_TITLE_LENGTH))
    .optional(),
  // The chat's language, for the fixed text the agents API writes during the turn, e.g. status updates
  language: languageSchema,
  // The page the visitor is on now, which the embedded chat asks the embedding widget for on every turn, so the assistant can
  // read it when it's on one of the installation's websites. Only a page its address identifies is kept (see
  // readablePageUrl); an unusable value is dropped, not rejected. Older clients and the standalone chat page send none
  pageUrl: z.string().optional().catch(undefined).transform(readablePageUrl),
})

export type TurnRequest = z.input<typeof turnRequestSchema>

// GET /agents/pre-sales?threadId=
export type ThreadStateResponse = {
  messages: LumiMessage[]
  // Whether the conversation takes no more messages: it ended with a booking or enquiry, or reached its message limit
  closed: boolean
}

// Longer URLs are dropped rather than cut, which would leave a broken link. The limit applies once the URL is normalized, as
// the parameters it drops often make a page's URL long; anything longer than the input limit isn't read at all
const MAX_PAGE_URL_LENGTH = 2048
const MAX_PAGE_URL_INPUT_LENGTH = 16384

// The campaign parameters kept: which campaign brought the visitor. utm_content and utm_term are left out, as email campaigns
// often fill them in per recipient, e.g. with the subscriber's address
const CAMPAIGN_PARAMETERS = new Set(["utm_source", "utm_medium", "utm_campaign", "utm_id"])

// Parameters that only track the visit, for analytics or ads, and never change what the page shows
const TRACKING_PARAMETERS = new Set([
  "gclid",
  "gbraid",
  "wbraid",
  "dclid",
  "fbclid",
  "msclkid",
  "twclid",
  "li_fat_id",
  "mc_cid",
  "mc_eid",
  "_ga",
  "_gl",
])
export const isTrackingParameter = (key: string) => {
  const name = key.toLowerCase()
  return TRACKING_PARAMETERS.has(name) || name.startsWith("utm_") || name.startsWith("hsa_") || name.startsWith("_hs")
}

// A path segment that looks like it carries personal data or a secret rather than naming a page: an email address, a uuid, or
// a long run of letters and digits without the hyphens a page's slug has, such as a token in an unsubscribe or invitation link
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
function looksPersonal(segment: string) {
  let value: string
  try {
    value = decodeURIComponent(segment)
  } catch {
    return true
  }
  if (value.includes("@") || UUID.test(value)) return true
  return value.length >= 16 && !value.includes("-") && /\d/.test(value) && /[a-z]/i.test(value)
}

function parsePageUrl(value: string | undefined) {
  if (!value || value.length > MAX_PAGE_URL_INPUT_LENGTH) return undefined

  let url: URL
  try {
    url = new URL(value)
  } catch {
    return undefined
  }
  return url.protocol === "http:" || url.protocol === "https:" ? url : undefined
}

// The page a visitor started the chat on, as the team sees it in the admin: an http(s) URL without credentials or fragment,
// keeping only the campaign parameters of its query, as other parameters may carry personal data. Anything else, including an
// invalid URL, is undefined rather than an error, so an odd host page never keeps the chat from starting
export function normalizePageUrl(value: string | undefined) {
  const url = parsePageUrl(value)
  if (!url) return undefined

  url.username = ""
  url.password = ""
  url.hash = ""
  for (const key of [...url.searchParams.keys()]) {
    if (!CAMPAIGN_PARAMETERS.has(key.toLowerCase())) url.searchParams.delete(key)
  }

  const normalized = url.toString()
  return normalized.length > MAX_PAGE_URL_LENGTH ? undefined : normalized
}

// The page a visitor is on during a turn, for the assistant to fetch and read: its http(s) URL without credentials, query or
// fragment, so fetching it never counts a visit towards a campaign. Only kept when that address alone identifies the page the
// visitor sees: a query parameter other than tracking ones (e.g. WordPress's ?p=123) or a fragment route (#/ or #!/) would
// make the assistant read another page as theirs. A path that looks like it carries personal data or a secret is dropped too,
// as the page is fetched and its URL kept with the conversation. Anything else is undefined rather than an error
export function readablePageUrl(value: string | undefined) {
  const url = parsePageUrl(value)
  if (!url) return undefined
  if ([...url.searchParams.keys()].some((key) => !isTrackingParameter(key))) return undefined
  if (/^#!?\//.test(url.hash)) return undefined
  if (url.pathname.split("/").some(looksPersonal)) return undefined

  url.username = ""
  url.password = ""
  url.search = ""
  url.hash = ""

  const readable = url.toString()
  return readable.length > MAX_PAGE_URL_LENGTH ? undefined : readable
}

// POST /agents/pre-sales/threads: starts a thread with the greeting in the chat's language. Older clients send no body or an
// initialMessage, which is ignored, and no pageUrl
export const createThreadRequestSchema = z.object({
  language: languageSchema,
  // The page the chat started on, e.g. the website page embedding it, recorded once with the thread when it's on one of the
  // installation's sites. An unusable value is dropped, not rejected
  pageUrl: z.string().optional().catch(undefined).transform(normalizePageUrl),
})

export type CreateThreadRequest = z.input<typeof createThreadRequestSchema>

export type CreateThreadResponse = {
  threadId: string
}

// Only zones Intl knows, e.g. not luxon's "local" (which would be the server's zone)
function isTimeZone(timeZone: string) {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone })
    return true
  } catch {
    return false
  }
}

function isLocale(locale: string) {
  try {
    return Intl.getCanonicalLocales(locale).length === 1
  } catch {
    return false
  }
}

// Describes a meeting the same way in the booking dialog, its confirmation and the confirmation saved on the thread.
// The slot is a [start, end] pair of unix timestamps in seconds; the time zone and locale default to the runtime's. The time
// range is written the way the locale writes one
export function formatMeetingTime([start, end]: [number, number], timeZone?: string, locale?: string) {
  const date = new Intl.DateTimeFormat(locale, { timeZone, weekday: "long", year: "numeric", month: "long", day: "numeric" })
  const time = new Intl.DateTimeFormat(locale, { timeZone, hour: "numeric", minute: "2-digit" })

  return `${date.format(start * 1000)}, ${time.formatRange(start * 1000, end * 1000)}`
}

// Longest values a visitor can send with a booking, in characters. The meeting picker prefills the topic and summary from the
// conversation, so they are as long as an enquiry's message allows
export const BOOKING_LIMITS = { name: ENQUIRY_LIMITS.name, email: ENQUIRY_LIMITS.email, phone: ENQUIRY_LIMITS.phone, topic: 200, summary: 4000 }

// POST /agents/pre-sales/booking. The slot is a [start, end] pair of unix timestamps in seconds; the visitor's IANA time
// zone and locale let the confirmation show the time as they picked it. Unknown ones are dropped rather than failing the
// booking. The text fields are bounded here rather than in meetingDataSchema, which also describes what the model extracts
export const bookingDataSchema = meetingDataSchema.extend({
  name: z.string().max(BOOKING_LIMITS.name).optional(),
  email: z.string().email().max(BOOKING_LIMITS.email),
  phone: z.string().max(BOOKING_LIMITS.phone).optional(),
  summary: z.string().max(BOOKING_LIMITS.summary),
  topic: z.string().max(BOOKING_LIMITS.topic),
  slot: z.tuple([z.number().int(), z.number().int()]),
  timeZone: z.string().max(64).refine(isTimeZone).optional().catch(undefined),
  locale: z.string().max(64).refine(isLocale).optional().catch(undefined),
})

export const bookingRequestSchema = z.object({
  threadId: threadIdSchema,
  data: bookingDataSchema,
  deleteMessageId: z.string().min(1),
  // The chat's language, for the confirmation saved on the thread
  language: languageSchema,
})

export type BookingRequest = z.infer<typeof bookingRequestSchema>

// GET /admin/pre-sales/threads/{id}/messages
export type ThreadMessagesResponse = {
  messages: LumiMessage[]
}

// POST /admin/pre-sales/threads/{id}/summary streams newline-delimited JSON: each line is the summary generated so far
export type ConversationSummary = {
  summary: string
  topic: string
  email?: string
  name?: string
  phone?: string
}

export type SummaryChunk = Partial<ConversationSummary>
