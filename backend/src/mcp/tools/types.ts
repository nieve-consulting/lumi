import type { SourceTerms } from "@/knowledge"
import type { ServiceContext, TeamPermission } from "@/services/context"
import type { MutationOutcome } from "@/services/mutations"
import type { KnowledgeSources, SourceKey } from "@lumi/shared-contracts/knowledge"
import { DEFAULT_LANGUAGE, LANGUAGES, TRANSLATION_LANGUAGES } from "@lumi/shared-contracts/language"
import type { ToolAnnotations } from "@modelcontextprotocol/server"
import { z } from "zod"

// A Lumi MCP tool: a thin adapter over a shared service call, with its access level and published schemas
export interface LumiTool<I extends z.ZodObject = z.ZodObject, O extends z.ZodObject = z.ZodObject> {
  name: string
  title: string
  description: string
  // public: no sign-in, public records only. read/write: OAuth with lumi:read / lumi:write and the matching team permission
  access: "public" | TeamPermission
  input: I
  output: O
  annotations: ToolAnnotations
  run: (ctx: ServiceContext, input: z.infer<I>) => Promise<z.infer<O>>
}

export const defineTool = <I extends z.ZodObject, O extends z.ZodObject>(tool: LumiTool<I, O>) => tool as unknown as LumiTool

// What the tool definitions are built from: the installation's business name (see src/business.ts), its knowledge sources
// (src/knowledge.ts), whose switches decide which tools, filters and fields exist and whose labels name the records in the
// titles and descriptions, and whether it offers resumes (src/resume.ts), which decides whether a team member's pdf_url is
// returned and promised. The name and the sources stay the same objects between edits, so the definitions are only built
// again after one
export type ToolContext = { businessName: string; knowledge: KnowledgeSources; terms: Record<SourceKey, SourceTerms>; resumes: boolean }

// Text at the start of a sentence, e.g. "A consultant's profile"
export { capitalized } from "@/utils/text"

// "(customer)" after the clients' label, as users may call them customers, unless the label already says so
export const customerHint = (clients: SourceTerms, plural = false) =>
  /customer/i.test(clients.plural) ? "" : plural ? " (customers)" : " (customer)"

// The keys whose value is true, e.g. the fields of the sources that are off
export const keysWhere = (flags: Record<string, boolean>) => Object.keys(flags).filter((key) => flags[key])

// The schema without the fields of sources that are off. Typed as the full schema: the fields left out are optional inputs,
// or outputs that withoutKeys removes from every result
export function withoutFields<T extends z.ZodObject>(schema: T, fields: string[]): T {
  return fields.length ? (schema.omit(Object.fromEntries(fields.map((field) => [field, true])) as never) as unknown as T) : schema
}

// The record without the fields of sources that are off, matching withoutFields
export function withoutKeys<T extends object>(record: T, keys: string[]): T {
  return keys.length ? (Object.fromEntries(Object.entries(record).filter(([key]) => !keys.includes(key))) as T) : record
}

export const idInput = (entity: string, source: string) =>
  z.object({ id: z.uuid({ error: "Must be a record id (UUID)" }).describe(`The ${entity} id, from ${source}`) })

type ReadWithOptions<I extends z.ZodObject, O extends z.ZodObject, Options> = Pick<
  LumiTool<I, O>,
  "name" | "title" | "description" | "input" | "output"
> & {
  run: (ctx: ServiceContext, input: z.infer<I>, options: Options) => Promise<z.infer<O>>
}

// Defines read tools whose input gains the option fields of `shape` (e.g. the language), which reach the service as options
// apart from the tool's own input
export function readWithOptions<S extends z.ZodRawShape, Options>(
  access: LumiTool["access"],
  shape: S,
  toOptions: (values: z.infer<z.ZodObject<S>>) => Options
) {
  return <I extends z.ZodObject, O extends z.ZodObject>({ input, run, ...tool }: ReadWithOptions<I, O, Options>) =>
    defineTool({
      ...tool,
      access,
      input: input.extend(shape),
      annotations: READ,
      run: (ctx, args) => {
        const values = args as Record<string, unknown>
        const own = Object.fromEntries(Object.entries(values).filter(([key]) => !(key in shape)))
        return run(ctx, own as z.infer<I>, toOptions(values as z.infer<z.ZodObject<S>>))
      },
    })
}

// The language a read returns content in
const languageInput = (description: string) => ({
  language: z
    .enum(LANGUAGES)
    // Defaulted rather than left undefined, so a cursor works whether or not the next call names English
    .default(DEFAULT_LANGUAGE)
    .describe(description),
})

// The language public reads return content in, so Nieve's website can build its pages in each language
export const languageInputShape = languageInput(
  `Language to return the content in, ${DEFAULT_LANGUAGE} (English) by default. A record with no text in it, or whose translation is outdated (English changed after it), is returned in English, as is a field it leaves untranslated; each record's language says which one it was returned in, and its fallback_fields the fields returned in English nonetheless`
)

// The language team reads return content in. Like the admin forms, a translation reads as saved even when English changed
// after it, which translations[].outdated tells, as the team edits it
export const teamLanguageInputShape = languageInput(
  `Language to return the content in, ${DEFAULT_LANGUAGE} (English) by default. A field the translation leaves untranslated, or a record with no translation in it or only an AI draft awaiting review, reads in English; each record's language says which one it was returned in, its fallback_fields the fields returned in English nonetheless, and translations lists the languages the record has, with the outdated ones, drafts and the fields each sets`
)

// Filters team lists by a missing translation, to find what is left to translate
export const missingLanguageInputShape = {
  missing_language: z
    .enum(TRANSLATION_LANGUAGES)
    .optional()
    .describe(
      "Only records with content left to translate into this language, to find what is left to translate: no translation in it yet (an AI draft counts as one), or for projects and team members, a contribution or work experience with English text that has none"
    ),
}

export const READ = { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false } satisfies ToolAnnotations
// Creations and additive links: safe to retry with the same idempotency_key
export const ADDITIVE_WRITE = { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false } satisfies ToolAnnotations
// Updates overwrite current values
export const OVERWRITING_WRITE = { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: false } satisfies ToolAnnotations

// Result of every write tool. entityType is the record type the tool writes, or the record types it can write
export function mutationOutput<T extends z.ZodType>(entityType: string | readonly [string, ...string[]], record: T) {
  return z.object({
    id: z.string().describe(`Id of the ${typeof entityType === "string" ? entityType : "record"} written`),
    entity_type: typeof entityType === "string" ? z.literal(entityType) : z.enum(entityType),
    record: record,
    replayed: z.boolean().describe("True when this is the stored result of an earlier call with the same idempotency_key; nothing was written again"),
  })
}

// The written record as the tool returns it, through view when given (e.g. without the fields of sources that are off)
export function mutationResult<T extends { id: string }>(entityType: string, { result, replayed }: MutationOutcome<T>, view = (record: T) => record) {
  return { id: result.id, entity_type: entityType, record: view(result), replayed }
}
