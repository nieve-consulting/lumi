import type { ResumeSettingsInput as GraphQLResumeSettingsInput, ResumeSettings } from "@/generated/graphql"
import { parseResumeSettings, ResumeSettingsError, type ResumeSettingsProblem } from "@lumi/shared-contracts/resume"

import type { FieldErrors } from "@/components/BusinessSettings/form"

// The resume settings as the admin form edits them: each text box's value, empty for unset (the default)
export type ResumeForm = {
  enabled: boolean
  logoUrl: string
  headerColor: string
  accentColor: string
  gradientColor: string
  footerText: string
}

// The fields that style the resume, shown while resumes are on
export const STYLE_FIELDS = ["logoUrl", "headerColor", "accentColor", "gradientColor", "footerText"] as const

export const formFromSettings = (settings: ResumeSettings): ResumeForm => ({
  enabled: settings.enabled,
  logoUrl: settings.logoUrl ?? "",
  headerColor: settings.headerColor ?? "",
  accentColor: settings.accentColor ?? "",
  gradientColor: settings.gradientColor ?? "",
  footerText: settings.footerText ?? "",
})

const orNull = (value: string) => value.trim() || null

// The settings as parseResumeSettings checks them and the updateResumeSettings mutation takes them: every field sent, unset
// ones as null so a save clears them
export const settingsFromForm = (form: ResumeForm): GraphQLResumeSettingsInput => ({
  enabled: form.enabled,
  logoUrl: orNull(form.logoUrl),
  headerColor: orNull(form.headerColor),
  accentColor: orNull(form.accentColor),
  gradientColor: orNull(form.gradientColor),
  footerText: orNull(form.footerText),
})

// The website's address as people write it, e.g. example.com for https://www.example.com/: what the footer text field suggests
export function displayUrl(url: string) {
  try {
    const { hostname, pathname } = new URL(url)
    return hostname.replace(/^www\./, "") + pathname.replace(/\/$/, "")
  } catch {
    return url
  }
}

// Every problem of each field, in one message: an accent colour can be both too light for the page and too close to the band
// colour, and the admin should fix both at once
export function errorsByField(problems: ResumeSettingsProblem[]): FieldErrors {
  const errors: FieldErrors = {}
  for (const { field, message } of problems) {
    const sentence = /[.!?]$/.test(message) ? message : `${message}.`
    errors[field] = errors[field] ? `${errors[field]} ${sentence}` : sentence
  }
  return errors
}

// Every problem with the form, by field, as the API would report them
export function validateForm(form: ResumeForm): FieldErrors {
  try {
    parseResumeSettings(settingsFromForm(form))
    return {}
  } catch (error) {
    if (error instanceof ResumeSettingsError) return errorsByField(error.problems)
    throw error
  }
}
