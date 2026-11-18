import { createHash } from "node:crypto"
import type { Language } from "@lumi/shared-contracts/language"
import { z } from "zod"

import { invalidInput } from "./errors"
import type { ReadLanguage } from "./translations"

export const LIST_DEFAULT_LIMIT = 20
export const LIST_MAX_LIMIT = 100
// Items returned in a relationship collection nested in a record; the list tools page through the rest
export const NESTED_LIMIT = 25
// Bounds for callers that cannot page (Lumi's chatbot tools), which get whole lists and relationship collections
export const COMPLETE_NESTED_LIMIT = 500
export const COMPLETE_LIST_LIMIT = 1000

export interface DetailOptions {
  // Items per nested relationship collection, NESTED_LIMIT by default
  nestedLimit?: number
  // Language to read the content in, English by default. Fields not translated into it read in English
  language?: ReadLanguage
}

export interface ListOptions {
  // Language to read the items' content in, English by default
  language?: ReadLanguage
}

export interface TeamListOptions extends ListOptions {
  // Only records with no translation in this language, to find what is left to translate
  missingLanguage?: Language
}

// Inputs every list operation accepts
export const listInputShape = {
  query: z
    .string()
    .trim()
    .min(1)
    .max(200)
    .optional()
    .describe("Optional search text, matched case-insensitively against names and descriptions. Omit it to list every record you may see"),
  limit: z.number().int().min(1).max(LIST_MAX_LIMIT).optional().describe(`Page size, ${LIST_DEFAULT_LIMIT} by default and at most ${LIST_MAX_LIMIT}`),
  cursor: z.string().max(500).optional().describe("Opaque next_cursor from the previous page of the same list, with the same filters"),
}

export interface ListInput {
  query?: string
  limit?: number
  cursor?: string
}

export interface Page<T> {
  items: T[]
  next_cursor: string | null
}

export const pageSchema = <T extends z.ZodType>(item: T) =>
  z.object({
    items: z.array(item),
    next_cursor: z.string().nullable().describe("Pass as cursor to get the next page; null when there are no more results"),
  })

// A nested relationship collection, bounded to NESTED_LIMIT items
export interface Nested<T> {
  items: T[]
  total: number
  truncated: boolean
}

export const nestedSchema = <T extends z.ZodType>(item: T) =>
  z.object({
    items: z.array(item),
    total: z.number().int().describe("Number of related records you may see"),
    truncated: z.boolean().describe("True when only the first items are included; use the matching list tool with a filter to see all of them"),
  })

export function nested<T>(items: T[], total = items.length, limit = NESTED_LIMIT): Nested<T> {
  return { items: items.slice(0, limit), total, truncated: total > Math.min(items.length, limit) }
}

// A cursor carries the offset and a fingerprint of the filters it was issued for, so it cannot be reused with other filters.
// The filters include the content language, which searches match in
function fingerprint(filters: unknown) {
  return createHash("sha256").update(JSON.stringify(filters)).digest("base64url").slice(0, 12)
}

export function pageWindow(input: ListInput, filters: unknown) {
  const limit = input.limit ?? LIST_DEFAULT_LIMIT
  const print = fingerprint(filters)
  let offset = 0

  if (input.cursor) {
    try {
      const decoded = JSON.parse(Buffer.from(input.cursor, "base64url").toString("utf8")) as { o?: unknown; f?: unknown }
      if (typeof decoded.o !== "number" || !Number.isInteger(decoded.o) || decoded.o < 0 || decoded.f !== print) throw new Error()
      offset = decoded.o
    } catch {
      throw invalidInput("The cursor is invalid or was issued for different filters. Start again without a cursor.")
    }
  }

  return {
    limit,
    offset,
    // One more row than the page tells whether there is a next page
    fetch: limit + 1,
    toPage<T>(rows: T[]): Page<T> {
      const hasMore = rows.length > limit
      return {
        items: rows.slice(0, limit),
        next_cursor: hasMore ? Buffer.from(JSON.stringify({ o: offset + limit, f: print })).toString("base64url") : null,
      }
    },
  }
}

// ILIKE pattern matching the text anywhere, with the LIKE wildcards in it escaped
export function containsPattern(text: string) {
  return `%${text.replace(/[\\%_]/g, (char) => `\\${char}`)}%`
}
