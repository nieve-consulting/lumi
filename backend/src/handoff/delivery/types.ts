import { appUrl } from "@/utils/urls"
import type { DeliveryChannelConfig, DeliveryChannelType, EnquiryField } from "@lumi/shared-contracts/handoff"

// An enquiry as the delivery channels send it (see src/services/enquiries.ts)
export type DeliverableEnquiry = {
  id: string
  submissionId: string
  threadId: string
  createdAt: Date
  // Only the fields the visitor filled in
  contact: Partial<Record<EnquiryField, string>>
  qualification: { question: string; answer: string }[]
  message: string | null
  topic: string | null
}

export type ChannelAvailability = { available: true } | { available: false; reason: string }

export type ChannelConfigOf<T extends DeliveryChannelType> = Extract<DeliveryChannelConfig, { type: T }>

// A delivery plugin: sends each enquiry to the team through one kind of destination. Admins set up channels of the types
// available on the server; each channel is a config of its plugin's type
export interface DeliveryChannel<T extends DeliveryChannelType> {
  type: T
  // Whether the server can deliver with it, e.g. email only once a sender is configured. The reason is for admins
  available(): ChannelAvailability
  // Where the channel sends to, for admins: never a secret
  describe(config: ChannelConfigOf<T>): string
  // Resolves once the destination accepted the enquiry and throws with an admin-readable message when it didn't. The
  // idempotency key is the same for every attempt of the enquiry on the channel, so a destination that honours it never
  // records the enquiry twice
  deliver(enquiry: DeliverableEnquiry, config: ChannelConfigOf<T>, options: { idempotencyKey: string }): Promise<void>
}

// Where the team reads the conversation the enquiry comes from
export const conversationUrl = (threadId: string) => appUrl(`/admin/conversations/${threadId}`)
