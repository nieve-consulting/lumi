import { ServiceError } from "@/services/errors"
import { adminRules, assertDateRange, assertStartedInPast, parseInput, toDate } from "@/services/rules"
import { contentKeys, type TranslatedRecord } from "@/services/translations"
import { DEFAULT_LANGUAGE, LANGUAGES, type Language } from "@lumi/shared-contracts/language"
import { GraphQLError } from "graphql"
import { z } from "zod"

// Admin mutations follow the same business rules as the MCP tools (src/services/rules.ts)

// Service errors are the caller's to fix, so they become user input errors; anything else is rethrown as is
export function asGraphQLError(error: unknown): never {
  if (error instanceof ServiceError) {
    throw new GraphQLError(error.message, { extensions: { code: "BAD_USER_INPUT" } })
  }
  throw error
}

// A language argument, which is optional. An unsupported language is rejected rather than read as English
export function parseOptionalLanguage(language: string | null | undefined): Language | undefined {
  if (language === null || language === undefined) return undefined
  if (!(LANGUAGES as readonly string[]).includes(language)) {
    throw new GraphQLError(`Unsupported language "${language}", expected one of ${LANGUAGES.join(", ")}`, {
      extensions: { code: "BAD_USER_INPUT" },
    })
  }
  return language as Language
}

// A language argument, English when omitted
export function parseLanguage(language: string | null | undefined): Language {
  return parseOptionalLanguage(language) ?? DEFAULT_LANGUAGE
}

export function checkAdminInput<S extends z.ZodType>(schema: S, input: unknown) {
  try {
    parseInput(schema, input)
  } catch (error) {
    asGraphQLError(error)
  }
}

function checkDates(start: string, end: string | null | undefined, startedInPast = false) {
  try {
    const startDate = toDate(start)
    if (startedInPast) assertStartedInPast(startDate)
    assertDateRange(startDate, end ? toDate(end) : null)
  } catch (error) {
    asGraphQLError(error)
  }
}

// The rules of a record's translatable fields. A save in a language other than English ignores the shared fields, so only
// its content is checked: a record whose shared fields fail today's rules can still be translated
function contentRules(schema: z.ZodObject, record: TranslatedRecord) {
  const content = new Set(contentKeys(record))
  return z.object(Object.fromEntries(Object.entries(schema.shape).filter(([key]) => content.has(key))))
}

const inEnglish = (language: Language) => language === DEFAULT_LANGUAGE

// Checks of the admin inputs saved in a language, English by default. Outside English only the content is checked
export const checkAdmin = {
  project: (input: { start_date: string; end_date?: string | null }, language: Language = DEFAULT_LANGUAGE) => {
    if (!inEnglish(language)) return checkAdminInput(contentRules(adminRules.project, "project"), input)
    checkAdminInput(adminRules.project, input)
    checkDates(input.start_date, input.end_date)
  },
  teamMember: (input: unknown, language: Language = DEFAULT_LANGUAGE) =>
    checkAdminInput(inEnglish(language) ? adminRules.teamMember : contentRules(adminRules.teamMember, "teamMember"), input),
  client: (input: unknown, language: Language = DEFAULT_LANGUAGE) =>
    checkAdminInput(inEnglish(language) ? adminRules.client : contentRules(adminRules.client, "client"), input),
  jobOpening: (input: unknown, language: Language = DEFAULT_LANGUAGE) =>
    checkAdminInput(inEnglish(language) ? adminRules.jobOpening : contentRules(adminRules.jobOpening, "jobOpening"), input),
  capability: (input: unknown, language: Language = DEFAULT_LANGUAGE) =>
    checkAdminInput(inEnglish(language) ? adminRules.capability : contentRules(adminRules.capability, "capability"), input),
  experiences: (inputs: ({ start_date: string; end_date?: string | null } | null)[], language: Language = DEFAULT_LANGUAGE) =>
    inputs.forEach((input) => {
      if (!input) return
      if (!inEnglish(language)) return checkAdminInput(contentRules(adminRules.experience, "experience"), input)
      checkAdminInput(adminRules.experience, input)
      checkDates(input.start_date, input.end_date, true)
    }),
  contributions: (inputs: { start_date: string; end_date?: string | null }[], language: Language = DEFAULT_LANGUAGE) =>
    inputs.forEach((input) => {
      if (!inEnglish(language)) return checkAdminInput(contentRules(adminRules.contribution, "projectTeamMember"), input)
      checkAdminInput(adminRules.contribution, input)
      checkDates(input.start_date, input.end_date)
    }),
  stars: (inputs: ({ stars: number } | null)[]) => inputs.forEach((input) => input && checkAdminInput(adminRules.stars, input.stars)),
}
