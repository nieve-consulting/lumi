import type { Thread } from "@/generated/graphql"
import { constructFilterFn } from "@tanstack/react-table"
import { DateTime } from "luxon"

export type ConversationStatus = "open" | "closed"

// Calendar days in the company's time zone, as yyyy-MM-dd; both ends are inclusive
export type StartedRange = { from?: string; to?: string }

// Columns the conversation search looks through
export const searchableColumns = ["name", "email", "topic"]

export const statusFilterFn = constructFilterFn({
  filter: (closed: Thread["closed"], status?: ConversationStatus) => !status || Boolean(closed) === (status === "closed"),
  autoRemove: (status?: ConversationStatus) => !status,
})

// A fixed time zone rather than the browser's, so the server renders the same conversations the browser shows
export const startedFilterFn = (timeZone: string) =>
  constructFilterFn({
    filter: (createdAt?: string, range?: StartedRange) => {
      const day = createdAt ? DateTime.fromISO(createdAt, { zone: timeZone }).toISODate() : null
      if (!day) return false
      return (!range?.from || day >= range.from) && (!range?.to || day <= range.to)
    },
    autoRemove: (range?: StartedRange) => !range?.from && !range?.to,
  })
