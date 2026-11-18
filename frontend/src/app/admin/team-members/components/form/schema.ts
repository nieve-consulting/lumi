import { z } from "zod"

import type { FieldDescription } from "@/app/admin/components/translations/languages"

const experienceFields = z.object({
  id: z.string().optional(),
  logo_file: z.instanceof(File).optional(),
  logo_key: z.string().optional(),
  company: z.string().max(256).min(1, { message: "Company is required" }),
  location: z.string().max(256).min(1, { message: "Location is required" }),
  position: z.string().max(256).min(1, { message: "Position is required" }),
  description: z.string().optional(),
  start_date: z.date().refine((date) => date < new Date(), { message: "Start Date must be in the past" }),
  end_date: z.date().nullable(),
})

const experienceSchema = experienceFields.refine((data) => data.end_date === null || data.start_date <= data.end_date, {
  message: "Start date must be before end date",
  path: ["end_date"],
})

const capabilitySchema = z.object({
  capabilityId: z.string(),
  name: z.string(),
  stars: z.number().int().min(1, { message: "Stars is required" }).max(5, { message: "Stars must be between 1 and 5" }),
})

export const teamMemberSchema = z.object({
  name: z.string().max(256).min(1, { message: "Name is required" }),
  job_title: z.string().max(256).min(1, { message: "Job Title is required" }),
  published: z.boolean(),
  url_slug: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, { message: "Invalid slug" }),
  bio: z.string().optional(),
  education: z.string().optional(),
  capability_highlights: z.string().optional(),
  profile_photo: z.instanceof(File).optional(),
  experiences: z.array(experienceSchema).optional(),
  capabilities: z.array(capabilitySchema).optional(),
  webpage: z.union([z.string().url({ message: "Invalid URL" }), z.string().length(0)]),
})

// Fields with content per language (TeamMemberTranslation); the others are shared by every language and edited in English
export const teamMemberContentFields = ["job_title", "capability_highlights", "bio", "education"] as const
// Content fields a language can leave untranslated, so they read in English. The job title is required in every language
export const teamMemberOptionalContentFields = ["capability_highlights", "bio", "education"] as const

// An experience's content per language (ExperienceTranslation). The position is required in every language; the description
// can be left untranslated
export const experienceContentFields = ["position", "description"] as const
export const experienceOptionalContentFields = ["description"] as const

// The kind of record, and its and its experiences' content fields, as the AI translation describes them to the model
export const teamMemberRecordKind = "team member profile"
export const teamMemberFieldDescriptions = {
  job_title: { label: "Job title" },
  capability_highlights: { label: "Capability highlights", markdown: true },
  bio: { label: "Bio", markdown: true },
  education: { label: "Education", markdown: true },
} satisfies Record<(typeof teamMemberContentFields)[number], FieldDescription>
export const experienceFieldDescriptions = (company: string) =>
  ({
    position: { label: `Experience at ${company}: position` },
    description: { label: `Experience at ${company}: description`, markdown: true },
  }) satisfies Record<(typeof experienceContentFields)[number], FieldDescription>

// What a translation validates: the team member's and its experiences' content, as the shared fields are read-only outside
// English (useTranslationResolver)
export const teamMemberContentSchema = teamMemberSchema
  .pick({ job_title: true, capability_highlights: true, bio: true, education: true })
  .extend({ experiences: z.array(experienceFields.pick({ position: true, description: true })).optional() })

export type TeamMemberFormSchema = z.infer<typeof teamMemberSchema>
export type TeamMemberExperienceSchema = z.infer<typeof experienceSchema>
