import { config } from "@/config"
import type { EnquiryRequest, HandoffSettingsProblem } from "@lumi/shared-contracts/handoff"
import {
  errorCodeOf,
  type AgentsErrorCode,
  type AgentsErrorResponse,
  type BookingRequest,
  type CreateThreadRequest,
  type CreateThreadResponse,
  type ThreadStateResponse,
} from "@lumi/shared-contracts/pre-sales"

// Public pre-sales routes of the agents API, called from the browser so requests carry the app origin

const preSalesUri = `${config.agents.uri}/pre-sales`

function post(url: string, body: unknown) {
  return fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) })
}

// A request the agents API refused or failed. code: why it refused it, e.g. a limit or a booking's time no longer free, for
// the chat to tell the visitor what to do
export class AgentsApiError extends Error {
  readonly status: number
  readonly code?: AgentsErrorCode
  readonly retryAfterSeconds?: number

  constructor(status: number, body: string, code?: AgentsErrorCode, retryAfterSeconds?: number) {
    super(`Agents API request failed: ${status} ${body}`)
    this.name = "AgentsApiError"
    this.status = status
    this.code = code
    this.retryAfterSeconds = retryAfterSeconds
  }
}

// Why the agents API refused a request and when to try again, from its error body
function limitOf(body: string) {
  let parsed: Partial<AgentsErrorResponse> | null = null
  try {
    parsed = JSON.parse(body)
  } catch {}
  const retryAfterSeconds = parsed?.retryAfterSeconds
  return {
    code: errorCodeOf(parsed),
    retryAfterSeconds: typeof retryAfterSeconds === "number" && retryAfterSeconds > 0 ? retryAfterSeconds : undefined,
  }
}

async function requestFailed(response: Response) {
  const body = await response.text().catch(() => "")
  const { code, retryAfterSeconds } = limitOf(body)
  return new AgentsApiError(response.status, body, code, retryAfterSeconds)
}

async function postJson<T>(url: string, body: unknown): Promise<T> {
  const response = await post(url, body)
  if (!response.ok) {
    throw await requestFailed(response)
  }

  return response.json()
}

// Returns null when the thread does not exist
export async function loadThread(threadId: string): Promise<ThreadStateResponse | null> {
  const response = await fetch(`${preSalesUri}?${new URLSearchParams({ threadId })}`)
  if (response.status === 404 || response.status === 400) {
    return null
  }
  if (!response.ok) {
    throw new Error(`Failed to load thread: ${response.status}`)
  }

  return response.json()
}

// The thread starts with the greeting in the request's language
export async function createNewThread(request: CreateThreadRequest) {
  return postJson<CreateThreadResponse>(`${preSalesUri}/threads`, request)
}

// Throws an AgentsApiError when refused, e.g. with the rate_limited or slot_unavailable code. A conflict means the thread already has its
// meeting, e.g. when retrying after the response to the booking was lost, so it counts as booked
export async function addBooking(request: BookingRequest) {
  const response = await post(`${preSalesUri}/booking`, request)
  if (!response.ok && response.status !== 409) {
    throw await requestFailed(response)
  }
}

// How sending an enquiry went. delivered: a delivery channel accepted it and the thread is closed; replyTo is where the team
// will reply, as the delivered enquiry has it. failed: no channel did, the enquiry is saved for the team and the visitor may
// send it again with the same submission id. invalid: the data has problems, by field ("contact.email", "answers.0").
// closed: the conversation was already closed. unavailable: the business doesn't take enquiries (any more), or the thread
// or the card isn't known, which no resend fixes. rate_limited: too many requests from the visitor's address; sending again
// after retryAfterSeconds works
export type EnquiryOutcome =
  | { status: "delivered"; replyTo: string | null }
  | { status: "failed" }
  | { status: "invalid"; problems: HandoffSettingsProblem[] }
  | { status: "closed" }
  | { status: "unavailable" }
  | { status: "rate_limited"; retryAfterSeconds?: number }

// Throws when the agents API can't be reached or answers anything else, so the form never reports an enquiry it doesn't
// know was sent
export async function addEnquiry(request: EnquiryRequest): Promise<EnquiryOutcome> {
  const response = await post(`${preSalesUri}/enquiry`, request)
  if (response.ok) {
    const body = (await response.json().catch(() => null)) as { status?: string; replyTo?: unknown } | null
    if (body?.status === "delivered") return { status: "delivered", replyTo: typeof body.replyTo === "string" ? body.replyTo : null }
    throw new Error(`Unexpected enquiry response: ${JSON.stringify(body)}`)
  }
  if (response.status === 502) {
    const body = (await response.json().catch(() => null)) as { status?: string } | null
    if (body?.status === "failed") return { status: "failed" }
  }
  if (response.status === 400) {
    const body = (await response.json().catch(() => null)) as { problems?: HandoffSettingsProblem[] } | null
    return { status: "invalid", problems: Array.isArray(body?.problems) ? body.problems : [] }
  }
  if (response.status === 429) {
    const { retryAfterSeconds } = limitOf(await response.text().catch(() => ""))
    return { status: "rate_limited", retryAfterSeconds }
  }
  if (response.status === 409) return { status: "closed" }
  if (response.status === 404 || response.status === 503) return { status: "unavailable" }
  throw await requestFailed(response)
}
