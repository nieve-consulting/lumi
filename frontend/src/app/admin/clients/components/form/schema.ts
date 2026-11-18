import { z } from "zod"

import type { FieldDescription } from "@/app/admin/components/translations/languages"

export const clientSchema = z.object({
  name: z.string().max(256).min(1, { message: "Name is required" }),
  summary: z.string().min(1, { message: "Summary is required" }),
  description: z.string().optional(),
  logo: z.instanceof(File).optional(),
  url_slug: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, { message: "Invalid slug" }),
  internal_webpage: z.union([z.string().url({ message: "Invalid URL" }), z.string().length(0)]),
  client_website: z.union([z.string().url({ message: "Invalid URL" }), z.string().length(0)]),
  published: z.boolean(),
})

export type ClientFormSchema = z.infer<typeof clientSchema>

// Fields with content per language (ClientTranslation); the others are shared by every language and edited in English
export const clientContentFields = ["summary", "description"] as const
// Content fields a language can leave untranslated, so they read in English. The summary is required in every language
export const clientOptionalContentFields = ["description"] as const

// The kind of record, and its content fields, as the AI translation describes them to the model
export const clientRecordKind = "client"
export const clientFieldDescriptions = {
  summary: { label: "Summary", markdown: true },
  description: { label: "Description", markdown: true },
} satisfies Record<(typeof clientContentFields)[number], FieldDescription>

// What a translation validates: the content, as the shared fields are read-only outside English (useTranslationResolver)
export const clientContentSchema = clientSchema.pick({ summary: true, description: true })
