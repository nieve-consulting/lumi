import net from "node:net"
import { consumeRateLimit, peekRateLimit, SOURCE_IP_HEADER } from "@/services/rateLimit"
import type { DbType } from "@db/db"
import { dailyConversationSpend } from "@db/schema"
import { eq, sql } from "drizzle-orm"

import { limitResponse } from "./http"
import { agentLimits } from "./limitSettings"

// Abuse and spending limits of the public agents routes, checked before the work they protect (model calls, the handoff lock,
// deliveries). Each refusal answers the AgentsErrorResponse of packages/shared-contracts with a code, which the chat explains
// to the visitor. Settings in limitSettings.ts

type RateLimitKind = "turns" | "threads" | "handoffs"

const RATE_LIMITS: Record<RateLimitKind, { bucket: string; windowSeconds: number; limit: () => number; message: string }> = {
  turns: {
    bucket: "chat-turns",
    windowSeconds: 60,
    limit: () => agentLimits().turnsPerMinute,
    message: "You're sending messages too quickly. Wait a moment and try again.",
  },
  threads: {
    bucket: "chat-threads",
    windowSeconds: 60,
    limit: () => agentLimits().threadsPerMinute,
    message: "Too many new conversations were started from your network. Wait a moment and try again.",
  },
  handoffs: {
    bucket: "chat-handoffs",
    windowSeconds: 60 * 60,
    limit: () => agentLimits().handoffsPerHour,
    message: "Too many meeting requests and enquiries were sent from your network. Try again later.",
  },
}

// An IPv6 address's /64 network, e.g. 2001:db8:1:2::/64: one subscriber usually gets a whole /64, so counting each address
// would let them use a new one for every request. Undefined for anything that isn't an IPv6 address
function ipv6Network(address: string) {
  // IPv4-mapped addresses (::ffff:a.b.c.d) count as the IPv4 address they carry
  if (!net.isIPv6(address) || address.includes(".")) return undefined

  const [head, tail] = address.toLowerCase().split("::")
  const groupsOf = (part: string | undefined) => (part ? part.split(":") : [])
  const groups =
    tail === undefined
      ? groupsOf(head)
      : [...groupsOf(head), ...Array<string>(8 - groupsOf(head).length - groupsOf(tail).length).fill("0"), ...groupsOf(tail)]
  return `${groups
    .slice(0, 4)
    .map((group) => Number.parseInt(group, 16).toString(16))
    .join(":")}::/64`
}

// The visitor's address as the entry set it from the connection (see SOURCE_IP_HEADER), counted by its /64 network for IPv6, or
// undefined when it isn't known, e.g. behind a proxy that doesn't forward it. Then the per-address limits don't apply, rather
// than every visitor sharing one count
function clientAddress(request: Request) {
  const address = request.headers.get(SOURCE_IP_HEADER)?.trim()
  if (!address || address === "unknown") return undefined
  return ipv6Network(address) ?? address
}

function rateLimitBucket(request: Request, kind: RateLimitKind) {
  const address = clientAddress(request)
  const limit = RATE_LIMITS[kind].limit()
  return address && limit > 0 ? { ...RATE_LIMITS[kind], bucket: `${RATE_LIMITS[kind].bucket}:${address}`, limit } : undefined
}

// Answers 429 once the visitor address is over its limit of the kind in the current window. count: counts this request
// against it. check: only refuses once the window is used up, without counting, for routes that count a request later, once
// it passed their own checks
export async function rateLimit(db: DbType, request: Request, kind: RateLimitKind, mode: "count" | "check" = "count"): Promise<Response | undefined> {
  const bucket = rateLimitBucket(request, kind)
  if (!bucket) return undefined

  const { allowed, retryAfterSeconds } = await (mode === "count" ? consumeRateLimit : peekRateLimit)(
    db,
    bucket.bucket,
    bucket.limit,
    bucket.windowSeconds
  )
  return allowed ? undefined : limitResponse(429, "rate_limited", bucket.message, retryAfterSeconds)
}

// How long the day's spending is reused before it is read again. A turn's usage is only recorded when it ends, so the limit
// can be passed by the turns running when it is reached and those started within this time
const SPEND_CACHE_MS = 60_000

let spend: { day: string; total: number; expiresAt: number } | undefined
// Concurrent reads of an expired total share one query
let loadingSpend: Promise<number> | undefined

// The day this process last logged that the limit was reached, so it is logged once a day rather than on every refusal
let warnedDay: string | undefined

const utcDay = () => new Date().toISOString().slice(0, 10)

// The recorded cost in USD of the conversations' model calls today (UTC): chat turns, their helper calls and embeddings, and
// the summaries the team asks for. Calls to a model without a price count as nothing. The daily total is independent of
// conversations and their usage records, so deletion cannot reset the allowance.
async function spentToday(db: DbType) {
  const day = utcDay()
  if (spend && spend.day === day && Date.now() < spend.expiresAt) return spend.total

  loadingSpend ??= db
    .select({ total: dailyConversationSpend.cost })
    .from(dailyConversationSpend)
    .where(eq(dailyConversationSpend.day, sql`(now() at time zone 'UTC')::date`))
    .then(([row]) => {
      spend = { day, total: Number(row?.total ?? 0), expiresAt: Date.now() + SPEND_CACHE_MS }
      return spend.total
    })
    .finally(() => {
      loadingSpend = undefined
    })
  return loadingSpend
}

// Answers 503 once today's spending reached LUMI_DAILY_SPEND_LIMIT_USD, until the next UTC day. Checked before a conversation
// starts or continues, so the model isn't called again
export async function checkDailySpend(db: DbType): Promise<Response | undefined> {
  const limit = agentLimits().dailySpendLimitUsd
  if (limit === undefined || (await spentToday(db)) < limit) return undefined

  if (warnedDay !== utcDay()) {
    warnedDay = utcDay()
    console.warn(`The daily spending limit of ${limit} USD is reached: the chat is unavailable until 00:00 UTC`)
  }
  return limitResponse(503, "unavailable", "The assistant isn't available right now. Please contact the team another way, or try again tomorrow.")
}
