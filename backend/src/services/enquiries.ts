import { deliverEnquiryTo, type DeliverableEnquiry } from "@/handoff/delivery"
import type { DbType } from "@db/db"
import { enquiries, enquiryDeliveries } from "@db/schema"
import { enquiryStatus, type DeliveryChannelConfig, type EnquiryStatus } from "@lumi/shared-contracts/handoff"
import { and, desc, eq, exists, gte, inArray, lt, ne, notExists, or, sql } from "drizzle-orm"
import { alias } from "drizzle-orm/pg-core"

import type { Queryable } from "./db"
import { invalidInput, notFound } from "./errors"

// Enquiries visitors send from the chat's handoff card, and their delivery to the team through the delivery channels of the
// handoff settings (src/handoff/delivery).
//
// Stored data, for data lifecycle and security:
// - enquiries: the thread it was sent from, the form's submission id, the contact details the visitor entered (only the
//   fields the business's form asks for: name, email, phone, company), the qualification questions with the visitor's
//   answers, the message and topic. The delivered enquiry's contact details, topic and message are also copied onto the
//   thread (threads.email, phone, name, topic, summary). Deleted with the thread (ON DELETE CASCADE); nothing else expires them.
// - enquiry_deliveries: per enquiry and channel, the channel's key and type, status, attempts, when it was delivered and the
//   latest error (an admin-readable message such as a webhook's HTTP status or host, never a secret). Deleted with the enquiry.
// - Delivered copies live on in the recipients' mailboxes and the webhook receivers, outside Lumi.
//
// Delivery never sends an enquiry twice through a channel that accepted it: each channel's row is claimed with a conditional
// update before sending, so concurrent resubmits and retries only send through rows they claimed, and delivered rows are
// never claimed again. Webhooks also get the same Idempotency-Key on every attempt

// A pending delivery not updated for this long was interrupted (e.g. the Lambda died while sending), so it reads as failed
// and a retry may claim it. Far above the slowest attempt: a webhook times out after 10 s
export const STALE_DELIVERY_MS = 5 * 60_000

const MAX_ERROR_LENGTH = 500

// How long a submit waits for deliveries another request is sending, so a resubmit answers with their outcome
const SETTLE_TIMEOUT_MS = 15_000
const SETTLE_POLL_MS = 500

// Tries at recording a delivery's outcome before it's left pending
const OUTCOME_WRITE_ATTEMPTS = 2

export type EnquiryRecord = typeof enquiries.$inferSelect
export type EnquiryDeliveryRecord = typeof enquiryDeliveries.$inferSelect
export type EnquiryWithDeliveries = EnquiryRecord & { deliveries: EnquiryDeliveryRecord[]; status: EnquiryStatus }

export type NewEnquiry = {
  threadId: string
  submissionId: string
  contact: EnquiryRecord["contact"]
  qualification: EnquiryRecord["qualification"]
  message: string | null
  topic: string | null
}

// The delivery as it stands: an interrupted one reads as failed
export function deliveryState(delivery: EnquiryDeliveryRecord, now = Date.now()): EnquiryDeliveryRecord {
  if (delivery.status !== "pending" || now - delivery.updated_at.getTime() <= STALE_DELIVERY_MS) return delivery
  return { ...delivery, status: "failed", last_error: "The delivery was interrupted before it finished" }
}

// The keys of the delivery channels set up now, which an enquiry's status is read against
export type ChannelKeys = ReadonlySet<string>

export const channelKeysOf = (channels: DeliveryChannelConfig[]): ChannelKeys => new Set(channels.map(({ key }) => key))

// The enquiry's status from its deliveries as they stand. Once a channel accepted it, the team has it: deliveries of
// channels removed since no longer count, as they can't be retried. Until then every delivery counts, so a failure on a
// removed channel still shows, and a retry sends it through every current channel
export function statusOf(deliveries: EnquiryDeliveryRecord[], channelKeys: ChannelKeys): EnquiryStatus {
  const delivered = deliveries.some(({ status }) => status === "delivered")
  return enquiryStatus(
    delivered ? deliveries.filter(({ status, channel_key }) => status === "delivered" || channelKeys.has(channel_key)) : deliveries
  )
}

// The delivery rows are returned as they stand, removed channels included, so admins still see them
function withDeliveries(enquiry: EnquiryRecord, deliveries: EnquiryDeliveryRecord[], channelKeys: ChannelKeys): EnquiryWithDeliveries {
  const states = deliveries.map((delivery) => deliveryState(delivery))
  return { ...enquiry, deliveries: states, status: statusOf(states, channelKeys) }
}

function deliveriesOf(db: Queryable, enquiryIds: string[]) {
  if (!enquiryIds.length) return Promise.resolve([])
  return db.select().from(enquiryDeliveries).where(inArray(enquiryDeliveries.enquiry_id, enquiryIds)).orderBy(enquiryDeliveries.channel_key)
}

const deliverable = (enquiry: EnquiryRecord): DeliverableEnquiry => ({
  id: enquiry.id,
  submissionId: enquiry.submission_id,
  threadId: enquiry.thread_id,
  createdAt: enquiry.created_at,
  contact: enquiry.contact,
  qualification: enquiry.qualification,
  message: enquiry.message,
  topic: enquiry.topic,
})

const errorMessage = (error: unknown) => (error instanceof Error ? error.message : String(error)).slice(0, MAX_ERROR_LENGTH)

// Takes the channel's delivery for this attempt: a new one, a failed one or an interrupted one, never a delivered one or one
// another request is sending. One conditional update, so two requests never both take it
async function claim(db: DbType, enquiryId: string, channel: DeliveryChannelConfig) {
  const now = new Date()
  const [delivery] = await db
    .update(enquiryDeliveries)
    .set({ status: "pending", attempts: sql`${enquiryDeliveries.attempts} + 1`, channel_type: channel.type, updated_at: now })
    .where(
      and(
        eq(enquiryDeliveries.enquiry_id, enquiryId),
        eq(enquiryDeliveries.channel_key, channel.key),
        ne(enquiryDeliveries.status, "delivered"),
        or(
          eq(enquiryDeliveries.status, "failed"),
          eq(enquiryDeliveries.attempts, 0),
          lt(enquiryDeliveries.updated_at, new Date(now.getTime() - STALE_DELIVERY_MS))
        )
      )
    )
    .returning()
  return delivery
}

type DeliveryOutcome = Pick<EnquiryDeliveryRecord, "status" | "last_error" | "updated_at"> & Partial<Pick<EnquiryDeliveryRecord, "delivered_at">>

// Records how the attempt went, trying the write again once. A send that went through must not be lost to a blip in the
// database: its row would stay pending, read as failed once stale, and be sent again by a retry
async function recordOutcome(db: DbType, deliveryId: string, outcome: DeliveryOutcome) {
  for (let attempt = 1; ; attempt++) {
    try {
      await db.update(enquiryDeliveries).set(outcome).where(eq(enquiryDeliveries.id, deliveryId))
      return
    } catch (error) {
      if (attempt >= OUTCOME_WRITE_ATTEMPTS) {
        console.error(`Error recording the ${outcome.status} delivery ${deliveryId}: it reads as interrupted once stale`, error)
        return
      }
    }
  }
}

// Sends through the channel's delivery if this request claimed it, and returns the delivery's id and how it went
async function deliverThrough(
  db: DbType,
  enquiry: EnquiryRecord,
  channel: DeliveryChannelConfig
): Promise<{ id: string; outcome: DeliveryOutcome } | undefined> {
  const delivery = await claim(db, enquiry.id, channel)
  if (!delivery) return

  let outcome: DeliveryOutcome
  try {
    await deliverEnquiryTo(deliverable(enquiry), channel)
    outcome = { status: "delivered", delivered_at: new Date(), last_error: null, updated_at: new Date() }
  } catch (error) {
    console.error(`Error delivering enquiry ${enquiry.id} through its ${channel.type} channel ${channel.key}`, error)
    outcome = { status: "failed", last_error: errorMessage(error), updated_at: new Date() }
  }
  await recordOutcome(db, delivery.id, outcome)
  return { id: delivery.id, outcome }
}

// The enquiry's deliveries once none is being sent by another request, or as they are after SETTLE_TIMEOUT_MS. This
// request's own deliveries are taken from their outcomes, which stand even if recording one failed
async function settledDeliveries(db: DbType, enquiryId: string, own: Map<string, DeliveryOutcome>) {
  const deadline = Date.now() + SETTLE_TIMEOUT_MS
  for (;;) {
    const deliveries = (await deliveriesOf(db, [enquiryId])).map((delivery) => {
      const outcome = own.get(delivery.id)
      return outcome ? { ...delivery, ...outcome } : delivery
    })
    if (Date.now() >= deadline || !deliveries.some((delivery) => deliveryState(delivery).status === "pending")) return deliveries
    await new Promise((resolve) => setTimeout(resolve, SETTLE_POLL_MS))
  }
}

// Sends the enquiry through every channel that hasn't delivered it, adding a delivery for channels it has none for. Rows of
// channels removed since are left as they are. Runs outside a transaction: the channels are sent to concurrently, and each
// send can take seconds
async function deliver(db: DbType, enquiry: EnquiryRecord, channels: DeliveryChannelConfig[]): Promise<EnquiryWithDeliveries> {
  if (channels.length) {
    const now = new Date()
    await db
      .insert(enquiryDeliveries)
      .values(channels.map((channel) => ({ enquiry_id: enquiry.id, channel_key: channel.key, channel_type: channel.type, updated_at: now })))
      .onConflictDoNothing({ target: [enquiryDeliveries.enquiry_id, enquiryDeliveries.channel_key] })
  }
  const sent = await Promise.all(channels.map((channel) => deliverThrough(db, enquiry, channel)))
  const own = new Map(sent.flatMap((attempt) => (attempt ? [[attempt.id, attempt.outcome] as const] : [])))

  return withDeliveries(enquiry, await settledDeliveries(db, enquiry.id, own), channelKeysOf(channels))
}

// Saves the visitor's enquiry and delivers it through the channels. Sending the same submission again (the visitor retrying
// after a failure, or a lost response) never creates a second enquiry and never sends again where it was delivered. Until a
// channel accepted it, a resubmit's corrected details replace the saved ones, since nobody has received them
export async function submitEnquiry(db: DbType, input: NewEnquiry, channels: DeliveryChannelConfig[]): Promise<EnquiryWithDeliveries> {
  const content = { contact: input.contact, qualification: input.qualification, message: input.message, topic: input.topic }
  const key = and(eq(enquiries.thread_id, input.threadId), eq(enquiries.submission_id, input.submissionId))

  let [enquiry] = await db
    .insert(enquiries)
    .values({ thread_id: input.threadId, submission_id: input.submissionId, ...content })
    .onConflictDoNothing({ target: [enquiries.thread_id, enquiries.submission_id] })
    .returning()

  if (!enquiry) {
    ;[enquiry] = await db.select().from(enquiries).where(key)
    if (!enquiry) throw new Error(`The enquiry of submission ${input.submissionId} disappeared while it was saved`)

    const deliveries = await deliveriesOf(db, [enquiry.id])
    if (deliveries.every((delivery) => deliveryState(delivery).status === "failed")) {
      ;[enquiry] = await db.update(enquiries).set(content).where(eq(enquiries.id, enquiry.id)).returning()
    }
  }

  return deliver(db, enquiry, channels)
}

// For admins: sends the enquiry again through each current channel that hasn't delivered it. Throws a not_found ServiceError
// for an unknown enquiry, or an invalid_input one when no channel is set up
export async function retryEnquiryDelivery(db: DbType, id: string, channels: DeliveryChannelConfig[]): Promise<EnquiryWithDeliveries> {
  const [enquiry] = await db.select().from(enquiries).where(eq(enquiries.id, id))
  if (!enquiry) throw notFound("enquiry", id)
  if (!channels.length) throw invalidInput("No delivery channel is set up. Add one in the enquiry settings, then retry.")

  return deliver(db, enquiry, channels)
}

// A thread's enquiries with their deliveries, newest first
export async function listThreadEnquiries(db: Queryable, threadId: string, channelKeys: ChannelKeys): Promise<EnquiryWithDeliveries[]> {
  const rows = await db.select().from(enquiries).where(eq(enquiries.thread_id, threadId)).orderBy(desc(enquiries.created_at))
  const deliveries = await deliveriesOf(
    db,
    rows.map(({ id }) => id)
  )
  return rows.map((enquiry) =>
    withDeliveries(
      enquiry,
      deliveries.filter(({ enquiry_id }) => enquiry_id === enquiry.id),
      channelKeys
    )
  )
}

// The threads with an enquiry the team must retry or follow up: partial or failed as statusOf reads it against the current
// channels, with interrupted deliveries counting as failed. One query for any number of threads, so the conversations list
// needs no query per thread
export async function threadsWithFailedEnquiries(db: Queryable, channelKeys: ChannelKeys): Promise<Set<string>> {
  const cutoff = new Date(Date.now() - STALE_DELIVERY_MS)
  const ofEnquiry = eq(enquiryDeliveries.enquiry_id, enquiries.id)
  const accepted = alias(enquiryDeliveries, "accepted")
  // Like statusOf: once a delivery was accepted, only the current channels' deliveries count
  const counted = or(
    notExists(
      db
        .select({ one: sql`1` })
        .from(accepted)
        .where(and(eq(accepted.enquiry_id, enquiries.id), eq(accepted.status, "delivered")))
    ),
    channelKeys.size ? inArray(enquiryDeliveries.channel_key, [...channelKeys]) : sql`false`
  )
  const rows = await db
    .selectDistinct({ threadId: enquiries.thread_id })
    .from(enquiries)
    .where(
      and(
        exists(
          db
            .select({ one: sql`1` })
            .from(enquiryDeliveries)
            .where(
              and(
                ofEnquiry,
                counted,
                or(eq(enquiryDeliveries.status, "failed"), and(eq(enquiryDeliveries.status, "pending"), lt(enquiryDeliveries.updated_at, cutoff)))
              )
            )
        ),
        notExists(
          db
            .select({ one: sql`1` })
            .from(enquiryDeliveries)
            .where(and(ofEnquiry, counted, eq(enquiryDeliveries.status, "pending"), gte(enquiryDeliveries.updated_at, cutoff)))
        )
      )
    )
  return new Set(rows.map(({ threadId }) => threadId))
}
