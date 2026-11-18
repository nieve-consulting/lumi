import { JOB_WORK_MODES } from "@lumi/shared-contracts/knowledge"
import { z } from "zod"

import { invalidInput } from "./errors"

// Business rules shared by the admin GraphQL API, the MCP tools and the services. The admin forms apply the same limits

export const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/
export const MIN_STARS = 1
export const MAX_STARS = 5
// Upper bound for long text fields (bios, descriptions) sent through the API
export const MAX_LONG_TEXT = 20_000
// Items accepted in one relationship array (capabilities or team members added at once)
export const MAX_LINKS_PER_CALL = 50
// URLs stored in a record's columns, and article URLs, which are only fetched or kept in the audit trail
export const MAX_URL_LENGTH = 256
export const MAX_ARTICLE_URL_LENGTH = 2048

export const uuidField = (description: string) =>
  z.uuid({ error: "Must be a record id (UUID). Look it up with the read tools." }).describe(description)

export const nameField = (description: string) => z.string().trim().min(1, "Must not be empty").max(256).describe(description)

export const slugField = z
  .string()
  .trim()
  .max(256)
  .regex(SLUG_PATTERN, "Must be lowercase letters and digits separated by single hyphens, e.g. acme-data-platform")
  .describe("Unique URL slug: lowercase letters and digits separated by hyphens, e.g. acme-data-platform")

export const shortTextField = (max: number, description: string) => z.string().trim().max(max).describe(description)

export const longTextField = (description: string) => z.string().max(MAX_LONG_TEXT).describe(description)

export const urlField = (description: string, maxLength = MAX_URL_LENGTH) =>
  z
    .url({ protocol: /^https?$/, error: "Must be an absolute http(s) URL" })
    .max(maxLength)
    .describe(description)

// Dates are calendar dates (YYYY-MM-DD) or ISO 8601 date-times with an offset
export const dateField = (description: string) =>
  z.union([z.iso.date(), z.iso.datetime({ offset: true })], { error: "Must be a date (YYYY-MM-DD) or an ISO 8601 date-time" }).describe(description)

export const starsField = z
  .number()
  .int()
  .min(MIN_STARS)
  .max(MAX_STARS)
  .describe(`Capability rating from ${MIN_STARS} (basic) to ${MAX_STARS} (expert), the same scale as the admin interface`)

export const projectLocations = ["REMOTE", "HYBRID", "ONSITE"] as const
export const locationField = z.enum(projectLocations).describe("Where the work happened: REMOTE, HYBRID or ONSITE")

// Calendar dates are stored at midnight UTC
export function toDate(value: string): Date {
  const date = new Date(/^\d{4}-\d{2}-\d{2}$/.test(value) ? `${value}T00:00:00.000Z` : value)
  if (Number.isNaN(date.getTime())) {
    throw invalidInput(`${value} is not a valid date.`)
  }

  return date
}

export function toOptionalDate(value: string | null | undefined) {
  return value ? toDate(value) : null
}

export function assertDateRange(start: Date, end: Date | null | undefined, label = "end_date") {
  if (end && end < start) {
    throw invalidInput(`${label} must not be before the start date.`, { field: label })
  }
}

// Experience entries describe past or current work, as in the admin form
export function assertStartedInPast(start: Date) {
  if (start > new Date()) {
    throw invalidInput("start_date must be in the past.", { field: "start_date" })
  }
}

export function assertUnique(ids: string[], field: string) {
  if (new Set(ids).size !== ids.length) {
    throw invalidInput(`${field} contains duplicates.`, { field })
  }
}

// Parses a value with a schema, turning failures into an invalid_input error that lists every problem
export function parseInput<T>(schema: z.ZodType<T>, value: unknown): T {
  const result = schema.safeParse(value)
  if (!result.success) {
    throw invalidInput(`Invalid input: ${z.prettifyError(result.error)}`)
  }

  return result.data
}

// Empty strings from the admin forms mean "no value" for optional fields
const optionalUrl = z.union([z.literal(""), urlField("URL")]).nullish()
const optionalShort = (max: number) => z.string().max(max).nullish()

// Rules the admin GraphQL inputs are checked against, matching the MCP inputs
export const adminRules = {
  project: z.object({
    name: nameField("Project name"),
    url_slug: slugField,
    start_date: dateField("Start date"),
    end_date: z.union([z.literal(""), dateField("End date")]).nullish(),
    location: locationField,
    webpage: optionalUrl,
    industry: optionalShort(50),
    type: optionalShort(50),
  }),
  teamMember: z.object({ name: nameField("Name"), job_title: nameField("Job title"), url_slug: slugField, webpage: optionalUrl }),
  client: z.object({
    name: nameField("Name"),
    summary: z.string().trim().min(1, "Must not be empty"),
    url_slug: slugField,
    client_website: optionalUrl,
    internal_webpage: optionalUrl,
  }),
  capability: z.object({ name: nameField("Name") }),
  jobOpening: z.object({
    title: nameField("Title"),
    summary: z.string().trim().min(1, "Must not be empty").max(2000),
    url_slug: slugField,
    location: nameField("Location"),
    work_mode: z.enum(JOB_WORK_MODES),
    application_url: optionalUrl,
    posted_at: dateField("Posted date"),
  }),
  experience: z.object({
    company: nameField("Company"),
    position: nameField("Position"),
    location: nameField("Location"),
    start_date: dateField("Start date"),
    end_date: z.union([z.literal(""), dateField("End date")]).nullish(),
  }),
  contribution: z.object({ start_date: dateField("Start date"), end_date: z.union([z.literal(""), dateField("End date")]).nullish() }),
  stars: starsField,
}
