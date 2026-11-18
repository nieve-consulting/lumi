import { businessSettings } from "@db/schema"
import {
  BusinessSettingsError,
  parseBusinessSettings,
  type BusinessConfig,
  type BusinessSettingsInput,
  type LocalizedText,
  type StarterIcon,
  type StarterInput,
} from "@lumi/shared-contracts/business"
import type { Language } from "@lumi/shared-contracts/language"
import { eq } from "drizzle-orm"

import { insertFirstAdmin, parseFirstAdmin } from "./adminAccounts"
import type { Queryable } from "./db"
import { ServiceError } from "./errors"
import { hashPassword } from "./passwords"

// The business the installation represents: a single record the onboarding wizard creates and admins edit. Until it exists
// the installation isn't set up. Both writes check the settings with parseBusinessSettings, which throws a
// BusinessSettingsError listing every problem by field. The agents and MCP read it through src/business.ts, which caches it

export type BusinessSettingsRecord = typeof businessSettings.$inferSelect

// Setting up a second time would overwrite the business: its settings are edited instead
export class BusinessAlreadySetUpError extends ServiceError {
  constructor() {
    super("conflict", "This installation is already set up. Edit its business settings instead.")
    this.name = "BusinessAlreadySetUpError"
  }
}

export class BusinessNotSetUpError extends ServiceError {
  constructor() {
    super("not_found", "This installation isn't set up yet. Complete the onboarding first.")
    this.name = "BusinessNotSetUpError"
  }
}

// The record, or null until the installation is set up
export async function getBusinessSettings(db: Queryable): Promise<BusinessSettingsRecord | null> {
  const [record] = await db.select().from(businessSettings).limit(1)
  return record ?? null
}

// The record as the settings it was saved from, the shape the wizard, the admin settings and parseBusinessSettings use
export function settingsOf(record: BusinessSettingsRecord): BusinessSettingsInput {
  return {
    businessName: record.business_name,
    websiteUrl: record.website_url,
    careersUrl: record.careers_url,
    contactUrl: record.contact_url,
    contactEmail: record.contact_email,
    contactPhone: record.contact_phone,
    assistantName: record.assistant_name,
    avatarUrl: record.avatar_url,
    logoUrl: record.logo_url,
    primaryColor: record.primary_color,
    defaultLanguage: record.default_language,
    starters: record.starters,
    greeting: record.greeting,
    agentDescription: record.agent_description,
    agentGuidance: record.agent_guidance,
  }
}

// The public configuration and the agent guidance of the record, with their defaults. Records are checked when saved, so
// this only throws (a BusinessSettingsError) for one saved under looser rules than today's
export function businessConfigOf(record: BusinessSettingsRecord): BusinessConfig {
  return parseBusinessSettings(settingsOf(record))
}

// Trims text; an empty one is unset
const textOrNull = (value: string | null | undefined) => value?.trim() || null

// Text by language without the empty entries, as parseBusinessSettings reads it
function localizedText(text: LocalizedText): LocalizedText {
  return Object.fromEntries(Object.entries(text).flatMap(([language, value]) => (value?.trim() ? [[language, value.trim()]] : []))) as LocalizedText
}

function starterOf({ icon, label, message }: StarterInput): StarterInput {
  const iconName = textOrNull(icon) as StarterIcon | null
  return { ...(iconName && { icon: iconName }), label: localizedText(label), message: localizedText(message) }
}

function greetingOf(greeting: LocalizedText | null | undefined): LocalizedText | null {
  const text = greeting && localizedText(greeting)
  return text && Object.keys(text).length ? text : null
}

// Checks the settings and returns the columns to store: as entered, trimmed, with unset fields null so a save clears them.
// Defaults (the assistant's name, the default language) are left to the readers, so a business keeps following them. The
// primary colour is stored as parseBusinessSettings reads it, lowercase #rrggbb. Throws a BusinessSettingsError
function columnsOf(input: BusinessSettingsInput) {
  const { public: settings, agent } = parseBusinessSettings(input)

  return {
    business_name: settings.businessName,
    website_url: settings.websiteUrl ?? null,
    careers_url: settings.careersUrl ?? null,
    contact_url: settings.contactUrl ?? null,
    contact_email: settings.contactEmail ?? null,
    contact_phone: settings.contactPhone ?? null,
    assistant_name: textOrNull(input.assistantName),
    avatar_url: settings.avatarUrl ?? null,
    logo_url: settings.logoUrl ?? null,
    primary_color: settings.primaryColor ?? null,
    default_language: textOrNull(input.defaultLanguage) as Language | null,
    // Null keeps the chat's built-in starters, an empty list shows none
    starters: input.starters ? input.starters.map(starterOf) : null,
    // Null keeps the built-in greeting, as does a greeting with no text in any language
    greeting: greetingOf(input.greeting),
    agent_description: agent.description ?? null,
    agent_guidance: agent.guidance ?? null,
  }
}

// The first admin account the setup creates, on an installation whose web app signs admins in with an email and password
export type FirstAdminInput = { email: string; name?: string | null; password: string }

// Creates the record the first time the installation opens. Open to the public onboarding wizard: its only guard is that no
// record exists yet, which the single-row key enforces atomically, so two concurrent setups can't both succeed. With a first
// admin, its account is created in the same transaction, only if there is no admin account yet. Throws a
// BusinessAlreadySetUpError once set up, an AdminAccountExistsError when an admin account exists already, or a
// BusinessSettingsError listing the problems with the settings and the first admin (firstAdmin.email, firstAdmin.password,
// firstAdmin.name)
export async function setupBusiness(db: Queryable, input: BusinessSettingsInput, firstAdmin?: FirstAdminInput): Promise<BusinessSettingsRecord> {
  // Checked first so a wizard sent again after the setup is told so rather than shown problems with its fields
  if (await getBusinessSettings(db)) throw new BusinessAlreadySetUpError()

  // Every problem at once, the settings' and the first admin's
  let columns: ReturnType<typeof columnsOf> | undefined
  const problems: BusinessSettingsError["problems"] = []
  try {
    columns = columnsOf(input)
  } catch (error) {
    if (!(error instanceof BusinessSettingsError)) throw error
    problems.push(...error.problems)
  }
  const admin = firstAdmin && parseFirstAdmin(firstAdmin)
  if (admin) problems.push(...admin.problems)
  if (!columns || problems.length) throw new BusinessSettingsError(problems)

  // Hashed before the transaction, which then holds its connection only briefly
  const passwordHash = firstAdmin && (await hashPassword(firstAdmin.password))
  const settings = columns
  return db.transaction(async (tx) => {
    const [record] = await tx
      .insert(businessSettings)
      .values({ id: true, ...settings })
      .onConflictDoNothing({ target: businessSettings.id })
      .returning()
    if (!record) throw new BusinessAlreadySetUpError()

    if (admin && passwordHash) await insertFirstAdmin(tx, { email: admin.email, name: admin.name, passwordHash })
    return record
  })
}

// Replaces every setting: fields left unset are cleared. Throws a BusinessNotSetUpError before the setup, or a
// BusinessSettingsError
export async function updateBusinessSettings(db: Queryable, input: BusinessSettingsInput): Promise<BusinessSettingsRecord> {
  const [record] = await db.update(businessSettings).set(columnsOf(input)).where(eq(businessSettings.id, true)).returning()
  if (!record) throw new BusinessNotSetUpError()

  return record
}
