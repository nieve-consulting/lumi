import { z } from "zod"

import { DEFAULT_LANGUAGE, LANGUAGES, type Language } from "./language"

// The business an installation represents: its name, branding, chat language, public contact links, the chat's starters and
// the agent's guidance. An operator sets them in the onboarding wizard the first time the installation opens, and admins
// edit them later; the backend stores them as a single record. Until the record exists the installation isn't set up: the
// chat shows the wizard and the agents API takes no conversations.
//
// Everything but the agent fields is public: the web app renders it and the widget fetches it. The agent fields are
// server-only guidance: only the backend reads them, and only admins see them

// Lumi's own name, the assistant's name unless the business gives it another
export const DEFAULT_ASSISTANT_NAME = "Lumi"

// How tool descriptions and helper prompts name the business before it is set up or while its settings can't be read
export const NEUTRAL_BUSINESS_NAME = "the business"

// "Acme's", or "Fjordline Architects'" for a name ending in s. "the business's" for the neutral name
export const possessive = (name: string) => (name !== NEUTRAL_BUSINESS_NAME && /s$/i.test(name) ? `${name}'` : `${name}'s`)

// Icons a starter can show, each a lucide icon the chat maps them to
export const STARTER_ICONS = ["message", "folder", "briefcase", "calendar", "search", "info", "sparkles", "users"] as const

export type StarterIcon = (typeof STARTER_ICONS)[number]

export const MAX_STARTERS = 4

export const GREETING_MAX_LENGTH = 500

// Text by language. The default language's text is required; the others fall back to it
export type LocalizedText = Partial<Record<Language, string>>

// A starter as the business sets it
export type StarterInput = {
  icon?: StarterIcon | null
  label: LocalizedText
  // Sent as the visitor's first message
  message: LocalizedText
}

// A suggested first message the chat offers before the conversation starts, with its text in every language the chat can be
// shown in. `languages` lists those the business wrote the label in, the text the chat shows; the others show the default
// language's label
export type Starter = {
  icon?: StarterIcon
  label: Record<Language, string>
  message: Record<Language, string>
  languages: Language[]
}

// Every setting, as the wizard and the admin settings send them and the backend stores them. Optional fields take null or
// undefined when unset; an empty text counts as unset
export type BusinessSettingsInput = {
  businessName: string
  websiteUrl?: string | null
  careersUrl?: string | null
  contactUrl?: string | null
  contactEmail?: string | null
  contactPhone?: string | null
  assistantName?: string | null
  avatarUrl?: string | null
  logoUrl?: string | null
  primaryColor?: string | null
  defaultLanguage?: string | null
  // Null or undefined shows the chat's built-in starters; an empty list shows none
  starters?: StarterInput[] | null
  // The assistant's first message. Null, undefined or no text uses the built-in greeting
  greeting?: LocalizedText | null
  agentDescription?: string | null
  agentGuidance?: string | null
}

export type PublicBusinessConfig = {
  // How visitors and the assistant name the business, e.g. "Acme Consulting"
  businessName: string
  // The assistant's name in the chat, its greeting, its replies and the widget's launcher. Defaults to Lumi
  assistantName: string
  // The business logo, shown next to its name. Omitted when unset
  logoUrl?: string
  // The assistant's picture in the chat header and dialogs. Unset shows Lumi's own
  avatarUrl?: string
  // The chat's accent colour as lowercase #rrggbb, dark enough for white text on it. Unset keeps the default theme
  primaryColor?: string
  // The language the chat is shown in when the visitor's choice, the page and the browser name none it supports
  defaultLanguage: Language
  // The business website, linked from the chat page
  websiteUrl?: string
  // Where visitors reach the team outside the chat, e.g. once a booking closes the conversation. See contactHref
  contactUrl?: string
  contactEmail?: string
  // As visitors should read it, e.g. "+34 610 096 740". See telHref
  contactPhone?: string
  // The page listing job openings, linked from job opening cards
  careersUrl?: string
  // The chat's suggested first messages. Unset shows the chat's built-in ones; an empty list shows none
  starters?: Starter[]
  // The assistant's first message in every language, those the business didn't write in showing the default language's.
  // Unset uses the built-in greeting (see greeting in ./pre-sales)
  greeting?: Record<Language, string>
}

// Server-only: shapes the agent's instructions, never sent to a visitor
export type AgentBusinessConfig = {
  // What the business provides: "…representing Acme, a provider of <description>"
  description?: string
  // Extra instructions for every conversation, below the application's own rules, which always take precedence
  guidance?: string
}

export type BusinessConfig = { public: PublicBusinessConfig; agent: AgentBusinessConfig }

// A problem with a setting, by its field ("contactEmail", "starters.1.label.es"), so a form can show it next to the field
export type BusinessSettingsProblem = { field: string; message: string }

// Lists every problem, so the operator fixes them all at once
export class BusinessSettingsError extends Error {
  constructor(readonly problems: BusinessSettingsProblem[]) {
    super(`Invalid business settings:\n${problems.map(({ field, message }) => `- ${field}: ${message}`).join("\n")}`)
    this.name = "BusinessSettingsError"
  }
}

// Trims text; an empty or null value counts as unset
const unset = (value: unknown) => (value === null ? undefined : typeof value === "string" ? value.trim() || undefined : value)

const optional = <T extends z.ZodType>(schema: T) => z.preprocess(unset, schema.optional())

const text = (max: number) => z.string().max(max, `Too long: at most ${max} characters`)

const webUrl = z.url({ protocol: /^https?$/, error: "Enter a full web address starting with https://, e.g. https://www.example.com/contact" })

// A path on the Lumi web app such as /media/logo.png, not a protocol-relative //host address
export const SITE_PATH = /^\/(?!\/)\S*$/

// An absolute http(s) URL, or a path on the Lumi web app such as /media/logo.png
export const imageUrl = z.union([z.url({ protocol: /^https?$/ }), z.string().regex(SITE_PATH)], {
  error: "Enter a full image address starting with https://, or a path on this site starting with /",
})

// Whether an address is one imageUrl accepts, e.g. for a form's preview while it's being typed
export const isImageUrl = (value: string) => imageUrl.safeParse(value).success

// A phone number as people write it, with its country code for visitors abroad
const phone = z
  .string()
  .regex(/^\+?[\d\s().-]+$/, "Use digits, spaces, dashes, dots or brackets, e.g. +34 610 096 740")
  .refine((number) => number.replace(/\D/g, "").length >= 6 && number.replace(/\D/g, "").length <= 15, "Enter 6 to 15 digits")

// Relative luminance of a #rrggbb colour, as WCAG 2 defines it
export function luminance(hex: string) {
  const [r, g, b] = [1, 3, 5].map((start) => {
    const channel = parseInt(hex.slice(start, start + 2), 16) / 255
    return channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4
  })
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

// WCAG contrast ratio of two #rrggbb colours, in either order
export function contrastRatio(first: string, second: string) {
  const [lighter, darker] = [luminance(first), luminance(second)].sort((a, b) => b - a)
  return (lighter + 0.05) / (darker + 0.05)
}

// WCAG contrast ratio of white text on a #rrggbb colour
export const whiteTextContrast = (hex: string) => 1.05 / (luminance(hex) + 0.05)

// The 4.5:1 contrast of normal text
export const MIN_PRIMARY_CONTRAST = 4.5

export const expandHex = (hex: string) => (hex.length === 4 ? `#${[...hex.slice(1)].map((digit) => digit + digit).join("")}` : hex).toLowerCase()

const HEX_COLOR = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i

// A #rgb or #rrggbb colour as entered (trimmed), as lowercase #rrggbb, or undefined for anything else, e.g. while it's typed
export function parseHexColor(value: string) {
  const trimmed = value.trim()
  return HEX_COLOR.test(trimmed) ? expandHex(trimmed) : undefined
}

// A primary colour as entered, as lowercase #rrggbb when it's a colour white text is readable on, else undefined: what the
// settings forms preview
export function readablePrimaryColor(value: string) {
  const hex = parseHexColor(value)
  return hex && whiteTextContrast(hex) >= MIN_PRIMARY_CONTRAST ? hex : undefined
}

// The chat writes white text on the primary colour (e.g. the visitor's messages), so it must keep the contrast of normal text.
// #rgb is expanded to #rrggbb
const primaryColor = z
  .string()
  .regex(HEX_COLOR, "Enter a hex colour such as #1d4ed8")
  .transform(expandHex)
  .refine((hex) => whiteTextContrast(hex) >= MIN_PRIMARY_CONTRAST, {
    error: (issue) => {
      const hex = expandHex(String(issue.input))
      return `${hex} is too light for white text (contrast ${whiteTextContrast(hex).toFixed(1)}:1, needs at least ${MIN_PRIMARY_CONTRAST}:1): pick a darker colour`
    },
  })

const language = z.enum(LANGUAGES, { error: `Choose one of ${LANGUAGES.join(", ")}` })

// Text by language: empty entries are dropped
const localizedText = (max: number) =>
  z.preprocess(
    (value) =>
      value && typeof value === "object" ? Object.fromEntries(Object.entries(value).filter(([, text]) => unset(text) !== undefined)) : value,
    z.partialRecord(language, z.string().trim().pipe(text(max)))
  )

const settingsSchema = z.object({
  businessName: z.preprocess(unset, z.string({ error: "Enter the business name visitors see, e.g. Acme Consulting" }).pipe(text(100))),
  websiteUrl: optional(webUrl),
  careersUrl: optional(webUrl),
  contactUrl: optional(webUrl),
  contactEmail: optional(z.email("Enter an email address, e.g. hello@example.com")),
  contactPhone: optional(phone),
  assistantName: optional(text(40)),
  avatarUrl: optional(imageUrl),
  logoUrl: optional(imageUrl),
  primaryColor: optional(primaryColor),
  defaultLanguage: optional(language),
  starters: z.preprocess(
    (value) => (value === null ? undefined : value),
    z
      .array(
        z.object({
          icon: optional(z.enum(STARTER_ICONS, { error: `Choose one of ${STARTER_ICONS.join(", ")}` })),
          label: localizedText(40),
          message: localizedText(500),
        })
      )
      .max(MAX_STARTERS, `At most ${MAX_STARTERS} starters`)
      .optional()
  ),
  greeting: z.preprocess((value) => (value === null ? undefined : value), localizedText(GREETING_MAX_LENGTH).optional()),
  agentDescription: optional(text(300)),
  agentGuidance: optional(text(2000)),
})

// Leaves out unset fields, so an object holds only what the business set
function defined<T extends object>(object: T): T {
  return Object.fromEntries(Object.entries(object).filter(([, value]) => value !== undefined)) as T
}

// Checks settings and splits them into the public configuration and the server-only agent guidance. Throws a
// BusinessSettingsError listing every problem by field. The backend checks what it stores and what it reads with it, so
// the web app, the widget and the agents always see the same configuration
export function parseBusinessSettings(input: unknown): BusinessConfig {
  const result = settingsSchema.safeParse(input ?? {})
  if (!result.success) {
    throw new BusinessSettingsError(result.error.issues.map((issue) => ({ field: issue.path.map(String).join("."), message: issue.message })))
  }

  const { data } = result
  const defaultLanguage = data.defaultLanguage ?? DEFAULT_LANGUAGE
  const problems: BusinessSettingsProblem[] = []

  // Every language a starter's or the greeting's text is shown in falls back to the default language's, which must be there
  const fill = (text: LocalizedText, field: string) => {
    const fallback = text[defaultLanguage]
    if (fallback === undefined) problems.push({ field: `${field}.${defaultLanguage}`, message: "Required: the other languages fall back to it" })
    return Object.fromEntries(LANGUAGES.map((language) => [language, text[language] ?? fallback ?? ""])) as Record<Language, string>
  }
  // A greeting with no text in any language is unset. Checked before the starters, which the forms show below it, so the
  // first problem is the first field
  const greeting = data.greeting && Object.keys(data.greeting).length ? fill(data.greeting, "greeting") : undefined
  const starters = data.starters?.map(({ icon, label, message }, index): Starter => {
    const filled = { label: fill(label, `starters.${index}.label`), message: fill(message, `starters.${index}.message`) }
    // The languages of the label, the only text shown, so the chat can mark a label in the default language's text as such
    const languages = LANGUAGES.filter((language) => language === defaultLanguage || label[language])
    return defined({ icon, ...filled, languages })
  })
  if (problems.length) throw new BusinessSettingsError(problems)

  return {
    public: defined({
      businessName: data.businessName,
      assistantName: data.assistantName ?? DEFAULT_ASSISTANT_NAME,
      logoUrl: data.logoUrl,
      avatarUrl: data.avatarUrl,
      primaryColor: data.primaryColor,
      defaultLanguage,
      websiteUrl: data.websiteUrl,
      contactUrl: data.contactUrl,
      contactEmail: data.contactEmail,
      contactPhone: data.contactPhone,
      careersUrl: data.careersUrl,
      starters,
      greeting,
    }),
    agent: defined({ description: data.agentDescription, guidance: data.agentGuidance }),
  }
}

// Where visitors reach the team outside the chat: the contact page, or else an email to the contact address. Undefined
// when the business sets neither, so the link is left out
export function contactHref({ contactUrl, contactEmail }: Pick<PublicBusinessConfig, "contactUrl" | "contactEmail">) {
  return contactUrl ?? (contactEmail ? `mailto:${contactEmail}` : undefined)
}

// A tel: link for the contact phone, dialling its digits and the leading + of its country code
export const telHref = (phone: string) => `tel:${phone.replace(/[^\d+]/g, "")}`

// What the widget fetches from the installation (GET /api/business on the web app) to label and colour its launcher.
// `configured: false` until the onboarding wizard is completed; the widget then shows no launcher
export type WidgetBusinessResponse =
  { configured: false } | { configured: true; assistantName: string; defaultLanguage: Language; primaryColor?: string }
