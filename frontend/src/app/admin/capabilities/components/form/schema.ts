import { z } from "zod"

import type { FieldDescription } from "@/app/admin/components/translations/languages"

export const capabilitySchema = z.object({
  name: z.string().max(256).min(1, { message: "Name is required" }),
  description: z.string().optional(),
})

export type CapabilityFormSchema = z.infer<typeof capabilitySchema>

// Fields with content per language (CapabilityTranslation): every field of a capability
export const capabilityContentFields = ["name", "description"] as const
// Content fields a language can leave untranslated, so they read in English. The name is required in every language
export const capabilityOptionalContentFields = ["description"] as const

// The kind of record, and its content fields, as the AI translation describes them to the model
export const capabilityRecordKind = "capability"
export const capabilityFieldDescriptions = {
  name: { label: "Name" },
  description: { label: "Description", markdown: true },
} satisfies Record<(typeof capabilityContentFields)[number], FieldDescription>
