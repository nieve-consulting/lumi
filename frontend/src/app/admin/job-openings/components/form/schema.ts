import { JOB_WORK_MODES } from "@lumi/shared-contracts/knowledge"
import { z } from "zod"

import type { FieldDescription } from "@/app/admin/components/translations/languages"

// The longest summary the API takes, in every language
const SUMMARY_MAX_LENGTH = 2000

// An application link as the API takes it: an http(s) address, or empty for none. A refinement rather than a union, so the
// message names the problem instead of zod's "Invalid input"
const httpUrl = z.url({ protocol: /^https?$/ })

export const jobOpeningSchema = z.object({
  title: z.string().max(256).min(1, { message: "Title is required" }),
  url_slug: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, { message: "Use lowercase letters, numbers and hyphens, e.g. senior-designer" }),
  summary: z
    .string()
    .min(1, { message: "Summary is required" })
    .max(SUMMARY_MAX_LENGTH, { message: `Use at most ${SUMMARY_MAX_LENGTH.toLocaleString("en")} characters` }),
  description: z.string().optional(),
  location: z.string().max(256).min(1, { message: "Location is required" }),
  work_mode: z.enum(JOB_WORK_MODES, { error: "Work mode is required" }),
  application_url: z
    .string()
    .max(256, { message: "Use at most 256 characters" })
    .refine((value) => value === "" || httpUrl.safeParse(value).success, { message: "Enter a full web address, e.g. https://example.com/apply" }),
  // yyyy-MM-dd, as a date input gives it
  posted_at: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, { message: "Posted date is required" }),
  published: z.boolean(),
})

export type JobOpeningFormSchema = z.infer<typeof jobOpeningSchema>

// Fields with content per language (JobOpeningTranslation); the others are shared by every language and edited in English
export const jobOpeningContentFields = ["title", "summary", "description"] as const
// Content fields a language can leave untranslated, so they read in English. The title and summary are required in every
// language, as the API requires them
export const jobOpeningOptionalContentFields = ["description"] as const

// The kind of record, and its content fields, as the AI translation describes them to the model
export const jobOpeningRecordKind = "job opening"
export const jobOpeningFieldDescriptions = {
  title: { label: "Job title" },
  summary: { label: "Summary" },
  description: { label: "Description", markdown: true },
} satisfies Record<(typeof jobOpeningContentFields)[number], FieldDescription>

// What a translation validates: the content, as the shared fields are read-only outside English (useTranslationResolver)
export const jobOpeningContentSchema = jobOpeningSchema.pick({ title: true, summary: true, description: true })
