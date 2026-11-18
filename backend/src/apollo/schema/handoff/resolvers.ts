import type { Context } from "@/apollo/types"
import type { EnquiryFieldSettingInput, HandoffSettingsInput as HandoffSettingsGraphQLInput, Resolvers } from "@/generated/graphql"
import { availableChannelTypes, describeChannel } from "@/handoff/delivery"
import {
  channelKeysOf,
  listThreadEnquiries,
  retryEnquiryDelivery,
  threadsWithFailedEnquiries,
  type EnquiryWithDeliveries,
} from "@/services/enquiries"
import { ServiceError } from "@/services/errors"
import { getHandoffSettings, handoffConfigOf, updateHandoffSettings, type HandoffSettingsRecord } from "@/services/handoffSettings"
import {
  DEFAULT_ENQUIRY_FIELDS,
  DEFAULT_HANDOFF_CONFIG,
  ENQUIRY_FIELDS,
  HandoffSettingsError,
  parseHandoffSettings,
  redactChannel,
  type DeliveryChannelConfig,
  type HandoffSettingsInput,
  type HandoffSettingsProblem,
} from "@lumi/shared-contracts/handoff"
import { GraphQLError } from "graphql"
import { z } from "zod"

import { asGraphQLError } from "../validation"

// The handoff settings (src/services/handoffSettings.ts) and the enquiries sent from conversations (src/services/enquiries.ts).
// The web app checks admin access before calling any of them, like the business settings. The delivery channels are only
// returned redacted: a webhook's secret never leaves the backend

// The settings as saved, so an admin sees and can correct them even if they no longer pass today's checks, or the defaults
function toHandoffSettings(record: HandoffSettingsRecord | null) {
  const fields = record?.enquiry_fields ?? DEFAULT_ENQUIRY_FIELDS
  const booking = record?.booking ?? DEFAULT_HANDOFF_CONFIG.public.booking
  return {
    qualificationQuestions: record?.qualification_questions ?? [],
    enquiryFields: ENQUIRY_FIELDS.map((field) => ({ field, mode: fields[field] ?? DEFAULT_ENQUIRY_FIELDS[field] })),
    booking: {
      type: booking.type,
      url: booking.type === "link" ? booking.url : null,
      label: booking.type === "link" ? (booking.label ?? null) : null,
    },
    enquiryEnabled: record?.enquiry_enabled ?? false,
    channels: (record?.delivery_channels ?? []).map((channel) => {
      const redacted = redactChannel(channel)
      return redacted.type === "webhook"
        ? { key: redacted.key, type: redacted.type, recipients: null, url: redacted.url, hasSecret: redacted.hasSecret }
        : { key: redacted.key, type: redacted.type, recipients: redacted.recipients, url: null, hasSecret: false }
    }),
    availableChannelTypes: availableChannelTypes(),
    updatedAt: record?.updated_at.toISOString() ?? null,
  }
}

// The GraphQL input as the settings parseHandoffSettings checks: the field list becomes a record. A field that isn't one of
// ENQUIRY_FIELDS or is given twice is reported on its own field, with every problem parseHandoffSettings finds
function settingsInput({ enquiryFields, ...input }: HandoffSettingsGraphQLInput): HandoffSettingsInput {
  const problems: HandoffSettingsProblem[] = []
  const fields: Record<string, string> = {}
  for (const { field, mode } of enquiryFields ?? ([] as EnquiryFieldSettingInput[])) {
    if (!(ENQUIRY_FIELDS as readonly string[]).includes(field)) {
      problems.push({ field: `enquiryFields.${field}`, message: `Choose one of ${ENQUIRY_FIELDS.join(", ")}` })
    } else if (field in fields) {
      problems.push({ field: `enquiryFields.${field}`, message: "Entered more than once" })
    } else {
      fields[field] = mode
    }
  }

  const settings: HandoffSettingsInput = { ...input, enquiryFields: enquiryFields ? fields : null }
  if (problems.length) {
    try {
      parseHandoffSettings(settings)
    } catch (error) {
      if (error instanceof HandoffSettingsError) problems.push(...error.problems)
    }
    throw new HandoffSettingsError(problems)
  }
  return settings
}

// Problems with the settings list each field, for the form to show next to it
function asHandoffSettingsError(error: unknown): never {
  if (error instanceof HandoffSettingsError) {
    throw new GraphQLError(error.message, { extensions: { code: "BAD_USER_INPUT", problems: error.problems } })
  }
  asGraphQLError(error)
}

// The channels deliveries are sent through now. Read fresh rather than from the agents' cache, so a retry right after an
// admin fixes a channel uses the fix
async function currentChannels(context: Context): Promise<DeliveryChannelConfig[]> {
  const record = await getHandoffSettings(context.drizzle)
  if (!record) return []
  try {
    return handoffConfigOf(record).channels
  } catch {
    // Saved under looser rules than today's: the channels as saved still say where enquiries went
    return record.delivery_channels
  }
}

function toEnquiry(enquiry: EnquiryWithDeliveries, channels: DeliveryChannelConfig[]) {
  return {
    id: enquiry.id,
    submissionId: enquiry.submission_id,
    createdAt: enquiry.created_at.toISOString(),
    status: enquiry.status,
    contact: ENQUIRY_FIELDS.flatMap((field) => (enquiry.contact[field] ? [{ field, value: enquiry.contact[field] }] : [])),
    qualification: enquiry.qualification,
    message: enquiry.message,
    topic: enquiry.topic,
    deliveries: enquiry.deliveries.map((delivery) => {
      const channel = channels.find(({ key }) => key === delivery.channel_key)
      return {
        channelKey: delivery.channel_key,
        channelType: delivery.channel_type,
        status: delivery.status,
        attempts: delivery.attempts,
        lastError: delivery.last_error,
        deliveredAt: delivery.delivered_at?.toISOString() ?? null,
        updatedAt: delivery.updated_at.toISOString(),
        destination: channel ? describeChannel(channel) : null,
      }
    }),
  }
}

// The threads with a failed enquiry, read once per request whatever the number of threads listed. A failed read only loses the
// badge: enquiryFailed is non-null, so an error would otherwise take down every thread of the list with it
const failedEnquiryThreads = new WeakMap<Context, Promise<Set<string>>>()

function threadsWithFailedEnquiriesOf(context: Context) {
  let threads = failedEnquiryThreads.get(context)
  if (!threads) {
    threads = currentChannels(context)
      .then((channels) => threadsWithFailedEnquiries(context.drizzle, channelKeysOf(channels)))
      .catch((error) => {
        console.error("Error reading the threads with failed enquiries, so none is marked", error)
        return new Set<string>()
      })
    failedEnquiryThreads.set(context, threads)
  }
  return threads
}

export const handoffResolvers: Resolvers = {
  Query: {
    handoffSettings: async (_, __, context) => toHandoffSettings(await getHandoffSettings(context.drizzle)),
  },
  Mutation: {
    updateHandoffSettings: async (_, { input }, context) => {
      try {
        return toHandoffSettings(await updateHandoffSettings(context.drizzle, settingsInput(input)))
      } catch (error) {
        asHandoffSettingsError(error)
      }
    },
    // An unknown enquiry fails with NOT_FOUND, no delivery channel with BAD_USER_INPUT
    retryEnquiryDelivery: async (_, { id }, context) => {
      const notFound = () => new GraphQLError(`No enquiry was found with id ${id}.`, { extensions: { code: "NOT_FOUND" } })
      if (!z.uuid().safeParse(id).success) throw notFound()

      const channels = await currentChannels(context)
      try {
        return toEnquiry(await retryEnquiryDelivery(context.drizzle, id.toLowerCase(), channels), channels)
      } catch (error) {
        if (error instanceof ServiceError && error.code === "not_found") throw notFound()
        asGraphQLError(error)
      }
    },
  },
  Thread: {
    enquiries: async (thread, _, context) => {
      // The status is read against the current channels (see statusOf)
      const channels = await currentChannels(context)
      const enquiries = await listThreadEnquiries(context.drizzle, thread.id, channelKeysOf(channels))
      return enquiries.map((enquiry) => toEnquiry(enquiry, channels))
    },
    enquiryFailed: async (thread, _, context) => (await threadsWithFailedEnquiriesOf(context)).has(thread.id),
  },
}
