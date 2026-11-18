import { channelAvailability } from "@/handoff/delivery"
import { handoffSettings } from "@db/schema"
import {
  DEFAULT_ENQUIRY_FIELDS,
  DELIVERY_CHANNEL_TYPES,
  ENQUIRY_FIELDS,
  HandoffSettingsError,
  parseHandoffSettings,
  type DeliveryChannelType,
  type EnquiryFieldModes,
  type FieldMode,
  type HandoffConfig,
  type HandoffSettingsInput,
  type HandoffSettingsProblem,
} from "@lumi/shared-contracts/handoff"

import type { Queryable } from "./db"

// How conversations are handed to the business: a single record admins edit, next to the business settings. Until it exists
// the defaults apply (DEFAULT_HANDOFF_CONFIG: no booking, no enquiries). Saves check the settings with parseHandoffSettings,
// which throws a HandoffSettingsError listing every problem by field. The agents read it through src/handoff.ts, which
// caches it. The delivery channels hold destinations and webhook secrets: only the backend reads them, admins get them
// redacted

export type HandoffSettingsRecord = typeof handoffSettings.$inferSelect

// The record, or null until the settings are first saved
export async function getHandoffSettings(db: Queryable): Promise<HandoffSettingsRecord | null> {
  const [record] = await db.select().from(handoffSettings).limit(1)
  return record ?? null
}

// The record as the settings it was saved from, with the secrets, so parseHandoffSettings reads it again
export function settingsOf(record: HandoffSettingsRecord): HandoffSettingsInput {
  return {
    qualificationQuestions: record.qualification_questions,
    enquiryFields: record.enquiry_fields,
    booking: record.booking,
    enquiryEnabled: record.enquiry_enabled,
    channels: record.delivery_channels,
  }
}

// The configuration of the record. Records are checked when saved, so this only throws (a HandoffSettingsError) for one
// saved under looser rules than today's
export function handoffConfigOf(record: HandoffSettingsRecord): HandoffConfig {
  return parseHandoffSettings(settingsOf(record), { savedChannels: record.delivery_channels })
}

// Channels of a type this server can't deliver with (email without a sender) would fail every enquiry, so they can't be saved
function unavailableChannelProblems(input: HandoffSettingsInput): HandoffSettingsProblem[] {
  return (input.channels ?? []).flatMap((channel, index) => {
    if (!(DELIVERY_CHANNEL_TYPES as readonly string[]).includes(channel.type)) return []
    const availability = channelAvailability(channel.type as DeliveryChannelType)
    return availability.available ? [] : [{ field: `channels.${index}.type`, message: availability.reason }]
  })
}

// The enquiry fields of checked settings with their defaults. The parsed configuration only carries them while enquiries are
// on, but they are kept while they are off so turning them back on restores the form
function fieldsOf(input: HandoffSettingsInput): EnquiryFieldModes {
  const fields = input.enquiryFields ?? {}
  return Object.fromEntries(
    ENQUIRY_FIELDS.map((field) => [field, (fields[field] as FieldMode | undefined) ?? DEFAULT_ENQUIRY_FIELDS[field]])
  ) as EnquiryFieldModes
}

// Replaces every setting, creating the record on the first save. A webhook sent without a secret keeps the one saved for its
// key. Throws a HandoffSettingsError listing the problems, including channels this server can't deliver with
export async function updateHandoffSettings(db: Queryable, input: HandoffSettingsInput): Promise<HandoffSettingsRecord> {
  const saved = await getHandoffSettings(db)

  const problems = unavailableChannelProblems(input)
  let config: HandoffConfig | undefined
  try {
    config = parseHandoffSettings(input, { savedChannels: saved?.delivery_channels ?? [] })
  } catch (error) {
    if (!(error instanceof HandoffSettingsError)) throw error
    problems.push(...error.problems)
  }
  if (!config || problems.length) throw new HandoffSettingsError(problems)

  // Stored as parsed, so the enquiry fields keep their defaults and the booking only the values its type uses
  const columns = {
    qualification_questions: config.public.qualificationQuestions,
    enquiry_fields: fieldsOf(input),
    booking: config.public.booking,
    enquiry_enabled: config.enquiryEnabled,
    delivery_channels: config.channels,
  }
  const [record] = await db
    .insert(handoffSettings)
    .values({ id: true, ...columns })
    .onConflictDoUpdate({ target: handoffSettings.id, set: { ...columns, updated_at: new Date() } })
    .returning()
  return record
}
