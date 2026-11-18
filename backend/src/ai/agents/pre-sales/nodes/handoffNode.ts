import { randomUUID } from "node:crypto"
import { EXTRACTION_MODEL } from "@/ai/models"
import { emitStatusUpdate } from "@/ai/utils"
import { requireBusinessConfig } from "@/business"
import { handoffConfig } from "@/handoff"
import { dispatchCustomEvent } from "@langchain/core/callbacks/dispatch"
import { AIMessage } from "@langchain/core/messages"
import { RunnableConfig } from "@langchain/core/runnables"
import { contactHref } from "@lumi/shared-contracts/business"
import type { Card } from "@lumi/shared-contracts/chat"
import {
  ENQUIRY_FIELDS,
  ENQUIRY_LIMITS,
  hasHandoff,
  type EnquiryField,
  type HandoffCardPayload,
  type PublicHandoffConfig,
} from "@lumi/shared-contracts/handoff"
import type { JSONValue } from "ai"

import { invokeExtractDataChain, type ExtractedData } from "../chains/extractData"
import { ensureConfiguration } from "../configuration"
import type { AgentStateType, AgentStateUpdateType } from "../state"
import { replyText, runText } from "../text"
import type { PreSalesSources } from "../types"

// The card types the handoff shows. The meeting picker books in the team's Google Calendar (POST booking); the handoff card
// links the booking page and carries the enquiry form (POST enquiry). Both are replaced by a confirmation once used, so
// their message's id travels with them
export const MEETING_PICKER_CARD = "meeting_picker"
export const HANDOFF_CARD = "handoff"

// Prefilled values are cut to what the form accepts, so the visitor only has to review them
const clip = (value: string | undefined, max: number) => (value ? value.slice(0, max) : undefined)

// The enquiry form: only the fields the business asks for, prefilled from the conversation, and every qualification question
// with the answer the conversation gave
function enquiryOf(fields: NonNullable<PublicHandoffConfig["enquiry"]>["fields"], questions: string[], data: ExtractedData) {
  const values: Partial<Record<EnquiryField, string>> = {}
  for (const field of ENQUIRY_FIELDS) {
    const value = fields[field] !== "off" ? clip(data[field], ENQUIRY_LIMITS[field]) : undefined
    if (value) values[field] = value
  }

  return {
    fields,
    values,
    qualification: questions.map((question, index) => ({ question, answer: clip(data.answers[index], ENQUIRY_LIMITS.answer) ?? "" })),
    message: clip(data.message, ENQUIRY_LIMITS.message) ?? "",
    ...(data.topic && { topic: data.topic }),
  } satisfies HandoffCardPayload["enquiry"]
}

const card = (id: string, card_type: string, payload: object): Card => ({ id, card_type, payload: payload as JSONValue })

// Runs in SCHEDULE_MEETING, when the visitor wants to book a meeting, send an enquiry or be contacted. Shows what the
// business set up in its handoff settings (src/handoff.ts):
// - calendar: the meeting picker (card id = message id), plus a handoff card with the enquiry form when enquiries are on
//   (card id = `${message id}-handoff`)
// - a booking link and/or enquiries: one handoff card (card id = message id) with the link and the form
// - nothing: a fixed reply pointing to the contact link, or saying the team can't be reached from the chat. No card, and
//   the conversation stays open
export const createHandoffNode = (sources: PreSalesSources) =>
  async function handoffNode(state: AgentStateType, config: RunnableConfig): Promise<AgentStateUpdateType> {
    const { thread_id: threadId } = ensureConfiguration(config)
    const text = replyText(state, config)
    const [business, handoff] = await Promise.all([requireBusinessConfig(sources.drizzle), handoffConfig(sources.drizzle)])
    const settings = handoff.public
    const id = randomUUID()

    if (!hasHandoff(settings)) {
      const content = text.noHandoff(contactHref(business.public))
      await dispatchCustomEvent("directMessage", content)
      return { messages: [new AIMessage({ id, content })] }
    }

    // Only the meeting picker and the enquiry form are prefilled: a card with just the booking link is built from the settings,
    // so it skips the extraction's model call
    const extract = async () => {
      await emitStatusUpdate(runText(config).status.gatheringInformation)
      return invokeExtractDataChain(EXTRACTION_MODEL, state.messages, settings.qualificationQuestions)
    }
    const data = settings.booking.type === "calendar" || settings.enquiry ? await extract() : undefined
    const enquiry = settings.enquiry && data && enquiryOf(settings.enquiry.fields, settings.qualificationQuestions, data)

    const cards: Card[] = []
    let content: string
    if (settings.booking.type === "calendar" && data) {
      const { name, email, phone, summary, topic } = data
      cards.push(card(id, MEETING_PICKER_CARD, { name, email, phone, summary, topic, threadId, deleteMessageId: id }))
      if (enquiry) cards.push(card(`${id}-handoff`, HANDOFF_CARD, { threadId, messageId: id, enquiry } satisfies HandoffCardPayload))
      content = enquiry ? text.meetingPickerOrEnquiry : text.meetingPicker
    } else {
      const { booking } = settings
      const link = booking.type === "link" ? { url: booking.url, ...(booking.label && { label: booking.label }) } : undefined
      cards.push(
        card(id, HANDOFF_CARD, { threadId, messageId: id, ...(link && { booking: link }), ...(enquiry && { enquiry }) } satisfies HandoffCardPayload)
      )
      content = link ? (enquiry ? text.bookingLinkOrEnquiry : text.bookingLink) : text.enquiry
    }

    await Promise.all([dispatchCustomEvent("messageAnnotation", { cards }), dispatchCustomEvent("directMessage", content)])

    return { messages: [new AIMessage({ id, content, additional_kwargs: { cards } })] }
  }
