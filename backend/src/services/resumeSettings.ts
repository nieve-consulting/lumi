import { resumeSettings } from "@db/schema"
import { parseHexColor } from "@lumi/shared-contracts/business"
import { DEFAULT_RESUME_SETTINGS, parseResumeSettings, type ResumeSettingsInput } from "@lumi/shared-contracts/resume"

import type { Queryable } from "./db"

// Whether the installation offers team member resumes, and the logo, colours and footer text of the PDF: a single record admins
// edit in Settings → Resumes, next to the business settings. Until it exists DEFAULT_RESUME_SETTINGS apply (resumes on, neutral
// colours, no logo, no footer text). Saves check the settings with parseResumeSettings, which throws a ResumeSettingsError listing every
// problem by field. The web app reads them through GraphQL to render the PDF and to decide whether to link it; the MCP
// server reads whether resumes are offered through src/resume.ts, which caches it. Every field is public

export type ResumeSettingsRecord = typeof resumeSettings.$inferSelect

// The record, or null until the settings are first saved
export async function getResumeSettings(db: Queryable): Promise<ResumeSettingsRecord | null> {
  const [record] = await db.select().from(resumeSettings).limit(1)
  return record ?? null
}

// The record as the settings it was saved from, or DEFAULT_RESUME_SETTINGS before the first save: the shape the admin
// settings and parseResumeSettings use
export function settingsOf(record: ResumeSettingsRecord | null): ResumeSettingsInput {
  if (!record) return DEFAULT_RESUME_SETTINGS
  return {
    enabled: record.enabled,
    logoUrl: record.logo_url,
    headerColor: record.header_color,
    accentColor: record.accent_color,
    gradientColor: record.gradient_color,
    footerText: record.footer_text,
  }
}

// Trims text; an empty one is unset
const textOrNull = (value: string | null | undefined) => value?.trim() || null

// A colour parseResumeSettings accepted, as lowercase #rrggbb, or null when unset so the reader applies its default
const colorOrNull = (value: string | null | undefined) => {
  const text = textOrNull(value)
  return text ? (parseHexColor(text) ?? null) : null
}

// Replaces every setting, creating the record on the first save: fields left unset are cleared, so their defaults apply.
// Settings are checked even while resumes are off, so turning them on never brings back an unreadable resume. Throws a
// ResumeSettingsError
export async function updateResumeSettings(db: Queryable, input: ResumeSettingsInput): Promise<ResumeSettingsRecord> {
  // Defaults are left to the readers, so the parsed colours (with the defaults filled in) are only used for the checks
  const config = parseResumeSettings(input)
  const columns = {
    enabled: config.enabled,
    logo_url: config.logoUrl ?? null,
    header_color: colorOrNull(input.headerColor),
    accent_color: colorOrNull(input.accentColor),
    gradient_color: config.gradientColor ?? null,
    footer_text: config.footerText ?? null,
  }
  const [record] = await db
    .insert(resumeSettings)
    .values({ id: true, ...columns })
    .onConflictDoUpdate({ target: resumeSettings.id, set: { ...columns, updated_at: new Date() } })
    .returning()
  return record
}
