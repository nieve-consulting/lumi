import { createHmac } from "node:crypto"
import { safePost } from "@/utils/safeFetch"

import { conversationUrl, type DeliverableEnquiry, type DeliveryChannel } from "./types"

// POSTs each enquiry as JSON to the channel's HTTPS URL, which must be a public address (see safePost: no private networks,
// no redirects). The receiver checks it came from Lumi with the signature: X-Lumi-Signature is
// sha256=<hex HMAC-SHA256 of `${X-Lumi-Timestamp}.${body}` keyed with the channel's secret>, and the timestamp (unix seconds)
// lets it reject old replays. Idempotency-Key is the same on every attempt for the enquiry and channel. Any 2xx answer
// within 10 s accepts the enquiry

const TIMEOUT_MS = 10_000

export const ENQUIRY_CREATED_EVENT = "enquiry.created"

// The webhook's body. Documented for receivers, so only add fields
export function webhookPayload(enquiry: DeliverableEnquiry) {
  return {
    event: ENQUIRY_CREATED_EVENT,
    enquiryId: enquiry.id,
    submissionId: enquiry.submissionId,
    threadId: enquiry.threadId,
    createdAt: enquiry.createdAt.toISOString(),
    contact: enquiry.contact,
    qualification: enquiry.qualification,
    message: enquiry.message,
    topic: enquiry.topic,
    conversationUrl: conversationUrl(enquiry.threadId),
  }
}

export function webhookSignature(secret: string, timestamp: string, body: string) {
  return `sha256=${createHmac("sha256", secret).update(`${timestamp}.${body}`).digest("hex")}`
}

export const webhookChannel: DeliveryChannel<"webhook"> = {
  type: "webhook",
  available: () => ({ available: true }),
  // The host only: the path may carry a token
  describe: ({ url }) => {
    try {
      return new URL(url).host
    } catch {
      return url
    }
  },
  async deliver(enquiry, { url, secret }, { idempotencyKey }) {
    const body = JSON.stringify(webhookPayload(enquiry))
    const timestamp = String(Math.floor(Date.now() / 1000))

    // safePost's errors say what went wrong (blocked address, timeout, HTTP status) and never include the secret
    await safePost(url, {
      body,
      timeoutMs: TIMEOUT_MS,
      httpsOnly: true,
      headers: {
        "Content-Type": "application/json",
        "Idempotency-Key": idempotencyKey,
        "X-Lumi-Timestamp": timestamp,
        "X-Lumi-Signature": webhookSignature(secret, timestamp, body),
      },
    })
  },
}
