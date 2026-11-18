// The limits of the public agents routes (src/ai/agents/limits.ts), read from the environment once per process. The container
// checks the values at startup (src/container/config.ts) and refuses to start with an invalid one; elsewhere, e.g. the Lambda,
// an invalid value is logged and the default applies. 0 turns a count limit off

export const COUNT_LIMITS = {
  // Chat messages (turns) per visitor address and minute
  turnsPerMinute: { variable: "LUMI_CHAT_TURNS_PER_MINUTE", defaultValue: 20 },
  // New conversations per visitor address and minute
  threadsPerMinute: { variable: "LUMI_CHAT_THREADS_PER_MINUTE", defaultValue: 10 },
  // Bookings and enquiries together per visitor address and hour
  handoffsPerHour: { variable: "LUMI_HANDOFFS_PER_HOUR", defaultValue: 5 },
  // Visitor messages in one conversation
  maxMessagesPerConversation: { variable: "LUMI_MAX_MESSAGES_PER_CONVERSATION", defaultValue: 50 },
} as const

// Model spending per UTC day in US dollars, for all conversations together. Unset for no limit
export const DAILY_SPEND_LIMIT_VARIABLE = "LUMI_DAILY_SPEND_LIMIT_USD"

// A whole number of at least 0, or undefined when the value isn't one
export const parseCount = (value: string) => (/^\d+$/.test(value) ? Number(value) : undefined)

// A positive amount such as 5 or 2.50, or undefined when the value isn't one
export function parseAmount(value: string) {
  const amount = Number(value)
  return /^\d+(\.\d+)?$/.test(value) && amount > 0 ? amount : undefined
}

const setting = (variable: string) => process.env[variable]?.trim() || undefined

function readCount({ variable, defaultValue }: { variable: string; defaultValue: number }) {
  const value = setting(variable)
  if (value === undefined) return defaultValue

  const count = parseCount(value)
  if (count === undefined) {
    console.error(`${variable} is "${value}", which is not a whole number of at least 0: its default of ${defaultValue} applies`)
    return defaultValue
  }
  return count
}

function readSpendLimit() {
  const value = setting(DAILY_SPEND_LIMIT_VARIABLE)
  if (value === undefined) return undefined

  const amount = parseAmount(value)
  if (amount === undefined) {
    console.error(`${DAILY_SPEND_LIMIT_VARIABLE} is "${value}", which is not a positive amount of US dollars: there is no daily spending limit`)
  }
  return amount
}

let limits: ReturnType<typeof readLimits> | undefined

function readLimits() {
  return {
    turnsPerMinute: readCount(COUNT_LIMITS.turnsPerMinute),
    threadsPerMinute: readCount(COUNT_LIMITS.threadsPerMinute),
    handoffsPerHour: readCount(COUNT_LIMITS.handoffsPerHour),
    maxMessagesPerConversation: readCount(COUNT_LIMITS.maxMessagesPerConversation),
    dailySpendLimitUsd: readSpendLimit(),
  }
}

// Read on first use rather than when the module loads, so the container's startup check reports an invalid value first
export function agentLimits() {
  limits ??= readLimits()
  return limits
}
