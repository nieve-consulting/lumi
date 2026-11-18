import type {
  BusinessSettings,
  BusinessStarter,
  BusinessSettingsInput as GraphQLBusinessSettingsInput,
  PublicBusinessSettings,
} from "@/generated/graphql"
import {
  contactHref,
  DEFAULT_ASSISTANT_NAME,
  type BusinessSettingsInput,
  type LocalizedText,
  type PublicBusinessConfig,
  type StarterIcon,
  type StarterInput,
} from "@lumi/shared-contracts/business"
import { DEFAULT_LANGUAGE, LANGUAGES } from "@lumi/shared-contracts/language"

// The business settings as the API stores them (see @lumi/shared-contracts/business), converted between the GraphQL shapes,
// where text by language is a list, and the settings parseBusinessSettings checks. Used by the server and the settings forms

// The configuration server code uses before the onboarding wizard has run, e.g. for an admin's resume download
export const UNSET_BUSINESS: PublicBusinessConfig = {
  businessName: "",
  assistantName: DEFAULT_ASSISTANT_NAME,
  defaultLanguage: DEFAULT_LANGUAGE,
}

// Lumi's own picture, the assistant's unless the business sets another
export const DEFAULT_AVATAR_URL = "/images/lumi-pebble.webp"

// The chat's default primary colour (the --primary of globals.css), for the settings forms' previews and colour picker
export const DEFAULT_PRIMARY_COLOR = "#2563eb"

export interface Business extends PublicBusinessConfig {
  // The assistant's picture: the business's or Lumi's own
  avatar: string
  // Where visitors reach the team outside the chat, or undefined to leave the link out
  contact?: string
}

export const toBusiness = (config: PublicBusinessConfig): Business => ({
  ...config,
  avatar: config.avatarUrl ?? DEFAULT_AVATAR_URL,
  contact: contactHref(config),
})

const textByLanguage = (entries: BusinessStarter["label"]): LocalizedText =>
  Object.fromEntries(
    entries.filter(({ language }) => (LANGUAGES as readonly string[]).includes(language)).map(({ language, text }) => [language, text])
  )

const textList = (text: LocalizedText) =>
  LANGUAGES.flatMap((language) => (text[language]?.trim() ? [{ language, text: text[language]!.trim() }] : []))

// Stored settings, public or admin, as parseBusinessSettings takes them
export function settingsFromGraphQL(settings: PublicBusinessSettings | BusinessSettings): BusinessSettingsInput {
  const { __typename, updatedAt, starters, greeting, ...fields } = settings
  return {
    ...fields,
    greeting: greeting ? textByLanguage(greeting) : null,
    starters: starters?.map(({ icon, label, message }) => ({
      icon: icon as StarterIcon | null,
      label: textByLanguage(label),
      message: textByLanguage(message),
    })),
  }
}

const orNull = (value: string | null | undefined) => value?.trim() || null

// Settings as the setupBusiness and updateBusinessSettings mutations take them: every field sent, unset ones as null so an
// update clears them
export function graphQLInput(settings: BusinessSettingsInput): GraphQLBusinessSettingsInput {
  return {
    businessName: settings.businessName.trim(),
    websiteUrl: orNull(settings.websiteUrl),
    careersUrl: orNull(settings.careersUrl),
    contactUrl: orNull(settings.contactUrl),
    contactEmail: orNull(settings.contactEmail),
    contactPhone: orNull(settings.contactPhone),
    assistantName: orNull(settings.assistantName),
    avatarUrl: orNull(settings.avatarUrl),
    logoUrl: orNull(settings.logoUrl),
    primaryColor: orNull(settings.primaryColor),
    defaultLanguage: orNull(settings.defaultLanguage),
    starters:
      settings.starters?.map(({ icon, label, message }: StarterInput) => ({
        icon: icon ?? null,
        label: textList(label),
        message: textList(message),
      })) ?? null,
    // No text in any language leaves the greeting unset, so the chat uses the built-in one
    greeting: settings.greeting && textList(settings.greeting).length ? textList(settings.greeting) : null,
    agentDescription: orNull(settings.agentDescription),
    agentGuidance: orNull(settings.agentGuidance),
  }
}
