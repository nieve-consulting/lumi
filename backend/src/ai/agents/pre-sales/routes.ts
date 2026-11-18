import { setMaxListeners } from "node:events"
import { createCheckpointer } from "@/ai/checkpointer"
import { WRITING_MODEL } from "@/ai/models"
import { createTracingHandler } from "@/ai/tracing"
import { createUsageHandler, EMBEDDING_USAGE_EVENT } from "@/ai/usage"
import { appUrl } from "@/ai/utils"
import { addEvent, getAppointmentSettings, isSlotFree, slotTimingProblem } from "@/apollo/schema/appointments/events"
import { businessConfig } from "@/business"
import { handoffConfig } from "@/handoff"
import { listThreadEnquiries, submitEnquiry, type EnquiryRecord, type EnquiryWithDeliveries } from "@/services/enquiries"
import { withThreadHandoffLock } from "@/services/threadHandoffs"
import { isPageOnSites } from "@/services/websiteUrls"
import { toUIMessageStream } from "@ai-sdk/langchain"
import { AIMessage, AIMessageChunk, BaseMessage, HumanMessage, RemoveMessage } from "@langchain/core/messages"
import type { StreamEvent } from "@langchain/core/tracers/log_stream"
import { propagateAttributes, startActiveObservation, type LangfuseSpan } from "@langfuse/tracing"
import { contactHref, type BusinessConfig } from "@lumi/shared-contracts/business"
import type { Card, LumiMessage, MessageAnnotation } from "@lumi/shared-contracts/chat"
import {
  enquiryDataSchema,
  enquiryRequestSchema,
  type EnquiryResponse,
  type HandoffCardPayload,
  type HandoffSettingsProblem,
} from "@lumi/shared-contracts/handoff"
import { formattingLocale, matchLanguage, type Language } from "@lumi/shared-contracts/language"
import {
  bookingRequestSchema,
  createThreadRequestSchema,
  formatMeetingTime,
  greeting,
  SLOT_UNAVAILABLE,
  threadIdSchema,
  turnRequestSchema,
  type AgentsErrorResponse,
  type CreateThreadResponse,
  type ThreadMessagesResponse,
  type ThreadStateResponse,
} from "@lumi/shared-contracts/pre-sales"
import { createUIMessageStream, createUIMessageStreamResponse, type InferUIMessageChunk } from "ai"

import { errorResponse, json, limitResponse, readJson } from "../http"
import { checkDailySpend, rateLimit } from "../limits"
import { agentLimits } from "../limitSettings"
import type { AgentContext, AgentRoutes, RouteParams } from "../types"
import { streamSummary } from "./chains/summarize"
import { createGraph } from "./graph"
import { toLumiMessages } from "./messages"
import { HANDOFF_CARD, MEETING_PICKER_CARD } from "./nodes/handoffNode"
import { preSalesText } from "./text"

setMaxListeners(15)

// Answered by the routes that start or continue a conversation until the onboarding wizard sets the installation up
function notSetUp() {
  return errorResponse(503, "This assistant isn't set up yet")
}

// Answered by the booking and enquiry routes while another handoff of the thread is still running (see withThreadHandoffLock).
// Nothing was done, so the client may send the same request again
function handoffBusy() {
  return errorResponse(423, "Another request for this conversation is still running. Try again in a moment.")
}

function createPreSalesGraph(context: AgentContext) {
  return createGraph(context, createCheckpointer(context.pool))
}

// A thread whose row exists but has no checkpoint (e.g. created before the checkpointer moved to Postgres) loads as an empty thread
async function getThreadMessages(context: AgentContext, threadId: string) {
  const state = await createPreSalesGraph(context).getState({ configurable: { thread_id: threadId } })

  return (state.values.messages as BaseMessage[] | undefined) ?? []
}

type Website = Awaited<ReturnType<AgentContext["db"]["getWebsites"]>>[number]

// The addresses of the business's own content: the business website and the websites Lumi crawls
function businessSiteUrls(business: BusinessConfig, websites: Website[]) {
  return [business.public.websiteUrl, ...websites.map((website) => website.url)]
}

// An adapter chunk as the browser gets it, or undefined to drop it. The chat only shows text (and ignores reasoning), so tool
// chunks are dropped: they carry the tools' inputs and whole results, such as a page read_current_page fetched. An error's
// text is replaced, as it may name a database query or a provider's message; the error itself is logged and traced
function visibleChunk(chunk: InferUIMessageChunk<LumiMessage>): InferUIMessageChunk<LumiMessage> | undefined {
  if (chunk.type.startsWith("tool-")) return undefined
  if (chunk.type === "error") return { type: "error", errorText: "An error occurred." }
  return chunk
}

// Whether the thread holds as many visitor messages as a conversation may (LUMI_MAX_MESSAGES_PER_CONVERSATION). Such a thread
// takes no more: the turn route refuses them, and its state reads as closed, so the chat keeps it ended after a reload
function atMessageLimit(messages: BaseMessage[]) {
  const { maxMessagesPerConversation } = agentLimits()
  return maxMessagesPerConversation > 0 && messages.filter((m) => HumanMessage.isInstance(m)).length >= maxMessagesPerConversation
}

// POST /agents/pre-sales: runs one chat turn and streams it as an AI SDK UI message stream (SSE). 429 when the visitor's address
// sends too many messages, 503 once the day's spending limit is reached, 409 for a closed thread or one at its message limit
async function runTurn(request: Request, context: AgentContext) {
  const refusal = (await rateLimit(context.drizzle, request, "turns")) ?? (await checkDailySpend(context.drizzle))
  if (refusal) return refusal

  const business = await businessConfig(context.drizzle)
  if (!business) return notSetUp()

  const body = await readJson(request, turnRequestSchema)
  if (!body.success) return body.response

  const { message, threadId, pageTitle, language, pageUrl } = body.data
  // Read together so the turn doesn't wait for each in turn: the websites only to check the page, the messages only to count
  // them against the message limit. The graph reads the messages again to run the turn
  const [thread, websites, messages] = await Promise.all([
    // Stamped as active before the turn runs: its checkpoint is only saved once it ends, which retention couldn't otherwise see
    context.db.markThreadActive(threadId),
    pageUrl ? context.db.getWebsites() : [],
    agentLimits().maxMessagesPerConversation > 0 ? getThreadMessages(context, threadId) : [],
  ])
  if (!thread) {
    return errorResponse(404, "Thread not found")
  }
  // A booking or a delivered enquiry ends the conversation: the chat stops offering the composer, and the API refuses it too
  if (thread.closed) {
    return limitResponse(409, "thread_closed", "This conversation has ended. Start a new conversation to keep chatting.")
  }
  if (atMessageLimit(messages)) {
    return limitResponse(409, "thread_limit", "This conversation has reached its message limit. Start a new conversation to keep chatting.")
  }

  const graph = createPreSalesGraph(context)
  const tracingHandler = createTracingHandler(threadId)
  const usageHandler = createUsageHandler(context.db, threadId)
  const config = {
    configurable: {
      thread_id: threadId,
      pageTitle,
      // The page the visitor is on during the turn, for read_current_page, as the embedded chat sends it (see readablePageUrl),
      // when it is on one of the business's sites. Any path of them is read, also those a crawl excludes, as the crawl settings
      // only shape what webpage_search finds; another host isn't, so a visitor can't have Lumi fetch and summarise any page
      pageUrl: pageUrl && isPageOnSites(pageUrl, businessSiteUrls(business, websites)) ? pageUrl : undefined,
      // Only for the fixed text written during the turn; the model is never told the chat's language
      language: language ?? business.public.defaultLanguage,
    },
  }

  // Created inside the turn's observation: the stream starts running the graph as soon as it is created
  const streamTurn = (span: LangfuseSpan) => {
    const stream = createUIMessageStream<LumiMessage>({
      execute: async ({ writer }) => {
        // Direct messages are dispatched as custom events; re-emit them as model stream events so the adapter streams them as text
        const directStream = new TransformStream<StreamEvent, StreamEvent>({
          transform: (chunk, controller) => {
            if (chunk.event === "on_custom_event" && chunk.name === "directMessage") {
              controller.enqueue({ ...chunk, event: "on_chat_model_stream", data: { chunk: new AIMessageChunk(chunk.data as string) } })
            } else {
              controller.enqueue(chunk)
            }
          },
        })

        const events = graph
          .streamEvents(
            {
              messages: [new HumanMessage({ content: message })],
            },
            {
              ...config,
              version: "v2",
              // Each checkpoint stores the whole message list again, so the turn is only saved when the graph exits (also on an
              // error or abort) rather than after every step. Only a turn whose Lambda dies mid-run is lost
              durability: "exit",
              // Aborted when the client disconnects, which stops the graph run
              signal: context.signal,
              callbacks: [
                ...(tracingHandler ? [tracingHandler] : []),
                usageHandler,
                {
                  handleCustomEvent: async (eventName, eventData) => {
                    switch (eventName) {
                      case "directMessage":
                        // Do nothing here as we are already handling this event in the directStream
                        break

                      case "statusUpdate":
                        writer.write({ type: "data-status", data: { message: eventData as string }, transient: true })
                        break

                      case "messageAnnotation":
                        writer.write({ type: "message-metadata", messageMetadata: eventData as MessageAnnotation })
                        break

                      case EMBEDDING_USAGE_EVENT:
                        // Recorded by the usage handler
                        break

                      default:
                        console.error("Unknown custom event", eventName)
                    }
                  },
                },
              ],
            },
            {
              excludeTags: ["not_visible"],
            }
          )
          .pipeThrough(directStream)

        // Write start/finish ourselves so status and metadata chunks always land inside the assistant message
        writer.write({ type: "start" })

        // The turn's observation stays open until the stream ends, so a failed or aborted turn never looks successful in Langfuse.
        // The adapter catches graph errors and turns them into error chunks, so they are reported through its callbacks
        let failure: string | undefined
        try {
          const reader = toUIMessageStream(events, {
            sendStart: false,
            sendFinish: false,
            onAbort: () => {
              failure = "Aborted"
            },
            onError: (error) => {
              failure = String(error)
            },
          }).getReader()
          while (true) {
            const { done, value } = await reader.read()
            if (done) break
            // The adapter only emits text, reasoning, tool and error chunks, never our custom data parts
            const chunk = visibleChunk(value as InferUIMessageChunk<LumiMessage>)
            if (chunk) writer.write(chunk)
          }
        } catch (error) {
          failure = String(error)
          throw error
        } finally {
          // Saved here so a failed or aborted turn still records the calls that completed
          await usageHandler.flush()

          if (context.signal.aborted) {
            span.update({ level: "WARNING", statusMessage: "Client disconnected" })
          } else if (failure) {
            span.update({ level: "ERROR", statusMessage: failure })
          } else {
            span.update({ output: "Turn completed. See the LangGraph run for the reply." })
          }
          span.end()
        }

        writer.write({ type: "finish" })
      },
      onError: (error) => {
        console.error("Error processing agent request", error)
        return "An error occurred."
      },
    })

    return createUIMessageStreamResponse({ stream })
  }

  // Trace name and session are context attributes in Langfuse v5, applied to every span created inside the callback
  return propagateAttributes({ traceName: "pre-sales", sessionId: threadId }, () =>
    startActiveObservation(
      "pre-sales-turn",
      (span) => {
        span.update({ input: message })
        return streamTurn(span)
      },
      { endOnExit: false }
    )
  )
}

// GET /agents/pre-sales?threadId=
async function getThreadState(request: Request, context: AgentContext) {
  const threadId = threadIdSchema.safeParse(new URL(request.url).searchParams.get("threadId"))
  if (!threadId.success) {
    return errorResponse(400, "Invalid threadId")
  }

  const thread = await context.db.getThread(threadId.data)
  if (!thread) {
    return errorResponse(404, "Thread not found")
  }

  const messages = await getThreadMessages(context, threadId.data)

  return json({ messages: toLumiMessages(messages), closed: thread.closed || atMessageLimit(messages) } satisfies ThreadStateResponse)
}

// Whether a page is on one of the installation's own sites: the business website, a website Lumi crawls, or the Lumi app
// itself, e.g. its chat page. Only those are recorded, as the team opens the page from the admin and anyone can send any URL
async function isInstallationPage(pageUrl: string, business: BusinessConfig, context: AgentContext) {
  if (isPageOnSites(pageUrl, [business.public.websiteUrl, appUrl("/")])) return true
  return isPageOnSites(pageUrl, businessSiteUrls(business, await context.db.getWebsites()))
}

// POST /agents/pre-sales/threads: creates the thread and seeds it with the greeting in the chat's language, introducing the
// installation's assistant, and records the page the chat started on when the client knows it. Older clients send no body,
// or the greeting as initialMessage, which is ignored; any body without a valid language gets the greeting in the
// installation's default language. 429 when the visitor's address starts too many, 503 once the day's spending limit is reached
async function createThread(request: Request, context: AgentContext) {
  const refusal = (await rateLimit(context.drizzle, request, "threads")) ?? (await checkDailySpend(context.drizzle))
  if (refusal) return refusal

  const business = await businessConfig(context.drizzle)
  if (!business) return notSetUp()

  const body = createThreadRequestSchema.safeParse(await request.json().catch(() => undefined))
  const language = body.data?.language ?? business.public.defaultLanguage
  const pageUrl = body.data?.pageUrl && (await isInstallationPage(body.data.pageUrl, business, context)) ? body.data.pageUrl : undefined

  const { id: threadId } = await context.db.createThread(pageUrl)

  await createPreSalesGraph(context).updateState(
    { configurable: { thread_id: threadId } },
    { messages: [new AIMessage(greeting(language, business.public))] }
  )

  return json({ threadId } satisfies CreateThreadResponse)
}

// Replaces the meeting picker's confirmation once the thread reloads, so it keeps the booked time and a way to follow up.
// Without the visitor's time zone (the booking schema drops unknown ones) it falls back to UTC rather than the server's. The
// date is in the chat's language: the visitor's locale only picks its regional variant, e.g. es-MX for a Spanish chat
function bookingConfirmation(
  language: Language,
  contact: string | undefined,
  email: string,
  slot: [number, number],
  timeZone?: string,
  locale?: string
) {
  const zone = timeZone ?? "UTC"
  const dateLocale = locale && matchLanguage(locale) === language ? locale : formattingLocale(language)
  const when = `${formatMeetingTime(slot, zone, dateLocale)} (${zone})`

  return preSalesText(language).bookingConfirmation(when, email, contact)
}

// Answered for a booking's time that can't be booked (see slotTimingProblem and isSlotFree), with the code that has the meeting
// picker offer the visitor other times rather than a retry
function slotUnavailable(message: string) {
  return json({ error: message, code: SLOT_UNAVAILABLE } satisfies AgentsErrorResponse, 400)
}

// POST /agents/pre-sales/booking: books the meeting and replaces the meeting picker with a confirmation message. 400 with the
// slot_unavailable code for a time that isn't free or bookable any more, 409 once the thread has its meeting, 423 while another
// booking or enquiry of the thread is running, 429 once the visitor's address has sent too many bookings and enquiries, 503
// while the business doesn't book through the calendar
async function addBooking(request: Request, context: AgentContext) {
  const business = await businessConfig(context.drizzle)
  if (!business) return notSetUp()

  const body = await readJson(request, bookingRequestSchema)
  if (!body.success) return body.response

  // The business may have stopped booking through the calendar since the picker was shown
  const handoff = await handoffConfig(context.drizzle)
  if (handoff.public.booking.type !== "calendar") {
    return errorResponse(503, "Meetings can't be booked here right now")
  }

  const { threadId, data, deleteMessageId, language = business.public.defaultLanguage } = body.data
  // Serialized with the thread's other handoffs, so the thread is read again once the one before it ended
  const answer = await withThreadHandoffLock(context.pool, threadId, async () => {
    const thread = await context.db.markThreadActive(threadId)
    if (!thread) {
      return errorResponse(404, "Thread not found")
    }
    // Booking closes the thread, so a closed thread already has its meeting. Booking again, e.g. when the response to the first
    // booking was lost, would book a second one
    if (thread.closed) {
      return errorResponse(409, "The meeting is already booked")
    }
    // Refused before the work below once the visitor's address has used up its bookings and enquiries. Only checked here, after
    // the answer to a booking sent again, which books nothing
    const limited = await rateLimit(context.drizzle, request, "handoffs", "check")
    if (limited) return limited
    // Only a meeting picker shown in this thread may be replaced: any other id would delete that message (LangGraph's remove-all
    // id even the whole conversation), and one missing from the thread would fail the checkpoint update after booking. The
    // picker's message may also carry a handoff card with the enquiry form, under its own id
    const messages = await getThreadMessages(context, threadId)
    const isPicker = (m: BaseMessage) =>
      m.id === deleteMessageId &&
      ((m.additional_kwargs as MessageAnnotation).cards ?? []).some((card) => card.card_type === MEETING_PICKER_CARD && card.id === deleteMessageId)
    if (!messages.some(isPicker)) {
      return errorResponse(400, "Unknown meeting picker")
    }

    // Only a free time within the appointment settings, of the meeting's length, is booked, so a request can't book any time,
    // of any length, or invite anyone at any hour
    const settings = await getAppointmentSettings(context)
    const timingProblem = slotTimingProblem(settings, data.slot)
    if (timingProblem) return slotUnavailable(timingProblem)

    // Counted before the calendar is asked whether the time is free, so every request that reaches it counts, booked or not.
    // Details the form checks fail before this, so a visitor correcting them isn't held back
    const overLimit = await rateLimit(context.drizzle, request, "handoffs")
    if (overLimit) return overLimit

    if (!(await isSlotFree(context.gCalendar, settings, data.slot))) {
      return slotUnavailable("This time is no longer available. Choose another time")
    }

    await addEvent(
      context,
      threadId,
      {
        start: data.slot[0],
        end: data.slot[1],
        topic: data.topic,
        name: data.name,
        summary: data.summary,
        email: data.email,
        phone: data.phone,
        conversationUrl: appUrl(`/admin/conversations/${threadId}`),
      },
      settings
    )

    await Promise.all([
      // Mark the conversation as completed and save topic and summary
      context.db.updateThread(threadId, { closed: true, topic: data.topic, summary: data.summary, email: data.email }),

      // Replaces the meeting picker with the confirmation in one update, so the thread gets one checkpoint rather than two. The
      // meeting is booked by now, so a failure is only logged: reporting it would have the visitor retry and get the 409
      createPreSalesGraph(context)
        .updateState(
          { configurable: { thread_id: threadId } },
          {
            messages: [
              new RemoveMessage({ id: deleteMessageId }),
              new AIMessage({
                content: bookingConfirmation(language, contactHref(business.public), data.email, data.slot, data.timeZone, data.locale),
              }),
            ],
          }
        )
        .catch((error) => console.error("Error saving the booking confirmation of thread", threadId, error)),
    ])

    return json({ success: true })
  })
  return answer ?? handoffBusy()
}

// The enquiry form of a handoff card shown on the thread's message, or undefined
function enquiryForm(messages: BaseMessage[], messageId: string) {
  const message = messages.find((m) => m.id === messageId)
  const cards: Card[] = (message?.additional_kwargs as MessageAnnotation | undefined)?.cards ?? []
  for (const card of cards) {
    const payload = card.payload as HandoffCardPayload | null
    if (card.card_type === HANDOFF_CARD && payload?.messageId === messageId && payload.enquiry) return payload.enquiry
  }
}

// Closes the thread with the delivered enquiry's details (only the contact fields its form asked for) and replaces the card's
// message with the confirmation in one checkpoint update, like a booking. The enquiry is delivered by now, so a failure is
// only logged: reporting it would have the visitor send it again. Without the card's message the confirmation is only added
async function closeWithConfirmation(
  context: AgentContext,
  threadId: string,
  cardMessageId: string | undefined,
  { contact, topic, message }: Pick<EnquiryRecord, "contact" | "topic" | "message">,
  confirmation: string
) {
  await Promise.all([
    context.db
      .updateThread(threadId, {
        closed: true,
        topic: topic ?? undefined,
        summary: message || undefined,
        email: contact.email,
        phone: contact.phone,
        name: contact.name,
      })
      .then((saved) => saved || console.error("Error closing thread", threadId, "after its enquiry was delivered")),

    createPreSalesGraph(context)
      .updateState(
        { configurable: { thread_id: threadId } },
        { messages: [...(cardMessageId ? [new RemoveMessage({ id: cardMessageId })] : []), new AIMessage({ content: confirmation })] }
      )
      .catch((error) => console.error("Error saving the enquiry confirmation of thread", threadId, error)),
  ])
}

// Where the team will reply to the enquiry, as it received it
const replyToOf = ({ contact }: Pick<EnquiryRecord, "contact">) => contact.email || contact.phone || null

// POST /agents/pre-sales/enquiry: saves the visitor's enquiry from a handoff card and delivers it to the team. Answers 200
// { status: "delivered", replyTo } once at least one delivery channel accepted it, closing the thread and replacing the card's
// message with a confirmation; 502 { status: "failed" } when none did, leaving the thread open for the visitor to try again
// with the same submission id, which never creates a second enquiry; 400 { error, problems } with the problems by field
// (contact.email, answers.0, message); 404 for an unknown thread or card; 423 while another booking or enquiry of the thread
// is running; 429 once the visitor's address has sent too many bookings and enquiries; 503 while enquiries aren't available.
// The enquiry stays saved either way, for the team to retry from the admin. Once an enquiry of the open thread was delivered
// (e.g. by that retry), any submission closes the thread as a delivery would and answers 200 with that enquiry's replyTo,
// without sending another
async function addEnquiry(request: Request, context: AgentContext) {
  const business = await businessConfig(context.drizzle)
  if (!business) return notSetUp()

  const body = await readJson(request, enquiryRequestSchema)
  if (!body.success) return body.response

  const { threadId, messageId, submissionId, data, language = business.public.defaultLanguage } = body.data
  // Serialized with the thread's other handoffs, so the thread is read again once the one before it ended
  const answer = await withThreadHandoffLock(context.pool, threadId, async () => {
    const thread = await context.db.markThreadActive(threadId)
    if (!thread) {
      return errorResponse(404, "Thread not found")
    }
    // The thread's enquiries, read once: this submission's, and any a channel accepted. Only whether a channel accepted one
    // matters here, not its status, so the current channels aren't needed
    const enquiries = await listThreadEnquiries(context.drizzle, threadId, new Set())
    const wasDelivered = (enquiry: EnquiryWithDeliveries) => enquiry.deliveries.some(({ status }) => status === "delivered")
    const sent = enquiries.find((enquiry) => enquiry.submission_id === submissionId)
    // This submission when it was delivered (e.g. the response was lost), else an earlier enquiry of the thread delivered while
    // it stayed open (e.g. by an admin's retry after the visitor saw the failure). The team has that one, so nothing is sent
    // again, and the visitor is told where the team will reply as it has it, not what this submission says
    const delivered = sent && wasDelivered(sent) ? sent : enquiries.find(wasDelivered)

    // The same submission sent again once delivered is answered as delivered, even if closing the thread or replacing the card
    // failed
    if (sent && sent === delivered && thread.closed) {
      return json({ status: "delivered", replyTo: replyToOf(sent) } satisfies EnquiryResponse)
    }
    // A delivered enquiry or a booking closes the thread
    if (thread.closed) {
      return errorResponse(409, "This conversation is closed")
    }
    // Refused before the work below once the visitor's address has used up its bookings and enquiries. Not for this submission
    // sent again, nor once an enquiry of the thread was delivered: neither sends a new enquiry (see the count below)
    if (!sent && !delivered) {
      const limited = await rateLimit(context.drizzle, request, "handoffs", "check")
      if (limited) return limited
    }

    const confirmation = preSalesText(language).enquiryConfirmation(contactHref(business.public))
    const form = enquiryForm(await getThreadMessages(context, threadId), messageId)

    // Closed now, as on a delivery, so the confirmation is what the visitor finds on reload
    if (delivered) {
      await closeWithConfirmation(context, threadId, form ? messageId : undefined, delivered, confirmation)
      return json({ status: "delivered", replyTo: replyToOf(delivered) } satisfies EnquiryResponse)
    }

    // Checked against the form the visitor was shown, so only the fields it asked for are kept. A card the thread doesn't hold
    // can't be sent whatever the visitor changes, so it isn't reported as a problem with their details
    if (!form) {
      return errorResponse(404, "Unknown enquiry form")
    }
    const parsed = enquiryDataSchema(form.fields, form.qualification.length).safeParse(data)
    if (!parsed.success) {
      const problems: HandoffSettingsProblem[] = parsed.error.issues.map((issue) => ({
        field: issue.path.map(String).join("."),
        message: issue.message,
      }))
      return json({ error: "Check the highlighted fields", problems } satisfies EnquiryResponse, 400)
    }

    // The business may have turned enquiries off since the card was shown
    const handoff = await handoffConfig(context.drizzle)
    if (!handoff.public.enquiry || !handoff.channels.length) {
      return errorResponse(503, "Enquiries are not available")
    }

    // Counted once the enquiry passed every check and is about to be delivered, so a visitor correcting a field isn't held back.
    // A submission sent again after no channel accepted it was counted when first sent: it delivers the enquiry already saved,
    // never a second one, to the destinations the admins configured
    if (!sent) {
      const overLimit = await rateLimit(context.drizzle, request, "handoffs")
      if (overLimit) return overLimit
    }

    const { contact, answers, message } = parsed.data
    const enquiry = await submitEnquiry(
      context.drizzle,
      {
        threadId,
        submissionId,
        contact,
        qualification: form.qualification.map(({ question }, index) => ({ question, answer: answers[index] ?? "" })),
        message: message || null,
        topic: form.topic ?? null,
      },
      handoff.channels
    )

    // One channel accepting it is enough for the visitor: the team has it, and retries the others from the admin
    if (!wasDelivered(enquiry)) {
      return json({ status: "failed" } satisfies EnquiryResponse, 502)
    }

    await closeWithConfirmation(context, threadId, messageId, enquiry, confirmation)

    return json({ status: "delivered", replyTo: replyToOf(enquiry) } satisfies EnquiryResponse)
  })
  return answer ?? handoffBusy()
}

// GET /admin/pre-sales/threads/{id}/messages
async function getAdminThreadMessages(_request: Request, context: AgentContext, { id }: RouteParams) {
  const threadId = threadIdSchema.safeParse(id)
  if (!threadId.success) {
    return errorResponse(400, "Invalid thread id")
  }

  const messages = await getThreadMessages(context, threadId.data)

  return json({ messages: toLumiMessages(messages) } satisfies ThreadMessagesResponse)
}

// POST /admin/pre-sales/threads/{id}/summary: streams the summary and saves topic and summary on the thread when it ends
async function summarizeThread(_request: Request, context: AgentContext, { id }: RouteParams) {
  const threadId = threadIdSchema.safeParse(id)
  if (!threadId.success) {
    return errorResponse(400, "Invalid thread id")
  }

  if (!(await context.db.getThread(threadId.data))) {
    return errorResponse(404, "Thread not found")
  }

  const messages = await getThreadMessages(context, threadId.data)

  // Traced in the conversation's session and recorded in the conversation's usage, so its cost counts towards the conversation
  const tracingHandler = createTracingHandler(threadId.data)
  const usageHandler = createUsageHandler(context.db, threadId.data)
  const stream = streamSummary(
    WRITING_MODEL,
    messages,
    context.signal,
    [...(tracingHandler ? [tracingHandler] : []), usageHandler],
    async ({ summary, topic, email, phone, name }) => {
      if (!(await context.db.updateThread(threadId.data, { summary, topic, email, phone, name }))) {
        console.error("Error saving the summary of thread", threadId.data)
      }
    },
    () => usageHandler.flush()
  )

  return new Response(stream, { headers: { "Content-Type": "application/x-ndjson; charset=utf-8", "Cache-Control": "no-cache" } })
}

export const preSalesRoutes: AgentRoutes = {
  public: [
    { method: "POST", path: "", handler: runTurn },
    { method: "GET", path: "", handler: getThreadState },
    { method: "POST", path: "threads", handler: createThread },
    { method: "POST", path: "booking", handler: addBooking },
    { method: "POST", path: "enquiry", handler: addEnquiry },
  ],
  admin: [
    { method: "GET", path: "threads/:id/messages", handler: getAdminThreadMessages },
    { method: "POST", path: "threads/:id/summary", handler: summarizeThread },
  ],
}
