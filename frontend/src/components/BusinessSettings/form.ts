import {
  BusinessSettingsError,
  parseBusinessSettings,
  type BusinessSettingsInput,
  type BusinessSettingsProblem,
  type StarterIcon,
} from "@lumi/shared-contracts/business"
import { DEFAULT_LANGUAGE, LANGUAGES, type Language } from "@lumi/shared-contracts/language"

// The business settings as the onboarding wizard and the admin settings edit them: every field a text box's value

export type StarterForm = { icon: StarterIcon | ""; label: Record<Language, string>; message: Record<Language, string> }

// builtIn: the chat's own starters; none: no starters; custom: the business's own
export type StartersMode = "builtIn" | "none" | "custom"

export type BusinessForm = {
  businessName: string
  websiteUrl: string
  careersUrl: string
  contactUrl: string
  contactEmail: string
  contactPhone: string
  assistantName: string
  avatarUrl: string
  logoUrl: string
  primaryColor: string
  defaultLanguage: Language
  startersMode: StartersMode
  starters: StarterForm[]
  // The assistant's first message by language; every language empty uses the built-in greeting
  greeting: Record<Language, string>
  agentDescription: string
  agentGuidance: string
}

// Problems by field ("contactEmail", "starters.1.label.es"), each field's message
export type FieldErrors = Record<string, string>

const byLanguage = (text: Partial<Record<Language, string>> = {}) =>
  Object.fromEntries(LANGUAGES.map((language) => [language, text[language] ?? ""])) as Record<Language, string>

export const emptyStarter = (): StarterForm => ({ icon: "", label: byLanguage(), message: byLanguage() })

// The form for stored settings, or an empty one for the wizard
export function formFromSettings(settings?: BusinessSettingsInput | null): BusinessForm {
  const text = (value: string | null | undefined) => value ?? ""
  const defaultLanguage = LANGUAGES.find((language) => language === settings?.defaultLanguage) ?? DEFAULT_LANGUAGE
  const starters = settings?.starters
  return {
    businessName: text(settings?.businessName),
    websiteUrl: text(settings?.websiteUrl),
    careersUrl: text(settings?.careersUrl),
    contactUrl: text(settings?.contactUrl),
    contactEmail: text(settings?.contactEmail),
    contactPhone: text(settings?.contactPhone),
    assistantName: text(settings?.assistantName),
    avatarUrl: text(settings?.avatarUrl),
    logoUrl: text(settings?.logoUrl),
    primaryColor: text(settings?.primaryColor),
    defaultLanguage,
    startersMode: !starters ? "builtIn" : starters.length ? "custom" : "none",
    starters: starters?.length
      ? starters.map(({ icon, label, message }) => ({ icon: icon ?? "", label: byLanguage(label), message: byLanguage(message) }))
      : [emptyStarter()],
    greeting: byLanguage(settings?.greeting ?? undefined),
    agentDescription: text(settings?.agentDescription),
    agentGuidance: text(settings?.agentGuidance),
  }
}

// The settings to check and save. A greeting with no text in any language is unset, so the chat uses the built-in one
export function settingsFromForm({ startersMode, starters, greeting, ...form }: BusinessForm): BusinessSettingsInput {
  return {
    ...form,
    greeting: LANGUAGES.some((language) => greeting[language].trim()) ? greeting : null,
    starters:
      startersMode === "builtIn"
        ? null
        : startersMode === "none"
          ? []
          : starters.map(({ icon, label, message }) => ({ icon: icon || null, label, message })),
  }
}

// Each field's first problem, e.g. a phone number's characters before its length, in the order they were found
export function errorsFromProblems(problems: BusinessSettingsProblem[]): FieldErrors {
  const errors: FieldErrors = {}
  for (const { field, message } of problems) errors[field] ??= message
  return errors
}

// Every problem with the form, by field, as the backend would report them
export function validateForm(form: BusinessForm): FieldErrors {
  try {
    parseBusinessSettings(settingsFromForm(form))
    return {}
  } catch (error) {
    if (error instanceof BusinessSettingsError) return errorsFromProblems(error.problems)
    throw error
  }
}

// The errors of the given fields: a field and anything under it, e.g. "starters" covers "starters.0.label.en"
export const errorsFor = (errors: FieldErrors, fields: readonly string[]) =>
  Object.fromEntries(Object.entries(errors).filter(([field]) => fields.some((prefix) => field === prefix || field.startsWith(`${prefix}.`))))

// A field's element id, so errors and labels can point to it
export const fieldId = (field: string) => `business-${field.replaceAll(".", "-")}`
