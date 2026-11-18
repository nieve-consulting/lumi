import { z } from "zod"

export const settingsSchema = z.object({
  location: z.string().max(256).min(1, { message: "Location is required" }),
  phone: z.string().max(256).min(1, { message: "Phone is required" }),
  email: z.string().email({ message: "Invalid email address" }),
  founding_story: z.string().optional(),
  values: z.string().optional(),
  mission: z.string().optional(),
  vision: z.string().optional(),
  webpage: z.union([z.string().url({ message: "Invalid URL" }), z.string().length(0)]).optional(),
})

export type SettingsFormSchema = z.infer<typeof settingsSchema>

// Fields with content per language (CompanyTranslation), all optional: a language can leave them untranslated, so they
// read in English. The others are shared by every language and edited in English
export const companyContentFields = ["founding_story", "values", "vision", "mission"] as const

// What a translation validates: the content, as the shared fields are read-only outside English (useTranslationResolver)
export const companyContentSchema = settingsSchema.pick({ founding_story: true, values: true, vision: true, mission: true })
