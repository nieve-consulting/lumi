import { DELIVERY_CHANNEL_TYPES, type DeliveryChannelConfig, type DeliveryChannelType } from "@lumi/shared-contracts/handoff"

import { emailChannel } from "./email"
import type { ChannelAvailability, DeliverableEnquiry, DeliveryChannel } from "./types"
import { webhookChannel } from "./webhook"

export type { DeliverableEnquiry } from "./types"

// The delivery plugins, one per channel type. A new type is added to DELIVERY_CHANNEL_TYPES in the shared contract, then
// registered here
const CHANNELS: { [T in DeliveryChannelType]: DeliveryChannel<T> } = {
  email: emailChannel,
  webhook: webhookChannel,
}

export function channelAvailability(type: DeliveryChannelType): ChannelAvailability {
  return CHANNELS[type].available()
}

// The channel types admins can set up on this server
export function availableChannelTypes(): DeliveryChannelType[] {
  return DELIVERY_CHANNEL_TYPES.filter((type) => CHANNELS[type].available().available)
}

// Where a channel sends to, for admins
export function describeChannel(config: DeliveryChannelConfig): string {
  return (CHANNELS[config.type] as DeliveryChannel<DeliveryChannelType>).describe(config as never)
}

// Sends the enquiry through the channel; throws with an admin-readable message when it wasn't accepted
export async function deliverEnquiryTo(enquiry: DeliverableEnquiry, config: DeliveryChannelConfig): Promise<void> {
  const channel = CHANNELS[config.type] as DeliveryChannel<DeliveryChannelType>
  const availability = channel.available()
  if (!availability.available) throw new Error(availability.reason)

  await channel.deliver(enquiry, config as never, { idempotencyKey: `${enquiry.id}:${config.key}` })
}
