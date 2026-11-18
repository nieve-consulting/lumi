import type { Client } from "@/generated/graphql"
import { z } from "zod"

import type { FieldDescription } from "@/app/admin/components/translations/languages"

const locationEnum = z.enum(["REMOTE", "HYBRID", "ONSITE"], { error: "Location is required" })

const teamMemberSchema = z.object({
  teamMemberId: z.string(),
  name: z.string(),
  description: z.string().optional(),
  start_date: z.date({ error: "Start Date is required" }),
  end_date: z.date().nullish(),
})

const capabilitySchema = z.object({ capabilityId: z.string(), name: z.string() })

const staticSchema = z.object({
  name: z.string().max(256).min(1, { message: "Name is required" }),
  start_date: z.date({ error: "Start Date is required" }),
  end_date: z.date().nullish(),
  location: locationEnum,
  client_id: z.string().optional(),
  industry: z.string().max(50).optional(),
  type: z.string().max(50).optional(),
  summary: z.string().optional(),
  description: z.string().optional(),
  teamMembers: z.array(teamMemberSchema).optional(),
  capabilities: z.array(capabilitySchema).optional(),
  url_slug: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, { message: "Invalid slug" }),
  webpage: z.union([z.string().url({ message: "Invalid URL" }), z.string().length(0)]),
  project_image: z.instanceof(File).optional(),
  published: z.boolean(),
})

export const projectSchemaFactory = (clients: Client[]) =>
  staticSchema
    .extend({
      client_id: z
        .string()
        .optional()
        .refine((id) => (id ? clients.some((client) => client.id === id) : true), { message: "Invalid Client" }),
    })
    .refine((data) => !data.end_date || data.start_date <= data.end_date, {
      message: "Start date must be before end date",
      path: ["end_date"],
    })
    // A team member without an end date ends with the project, so none can start after it ended
    .superRefine((data, ctx) => {
      data.teamMembers?.forEach((teamMember, index) => {
        if (data.end_date && teamMember.start_date > data.end_date) {
          ctx.addIssue({ code: "custom", message: "Start date must not be after the project's end date", path: ["teamMembers", index, "start_date"] })
        }
        if (teamMember.end_date && teamMember.start_date > teamMember.end_date) {
          ctx.addIssue({ code: "custom", message: "Start date must be before end date", path: ["teamMembers", index, "end_date"] })
        }
      })
    })

// Fields with content per language (ProjectTranslation); the others are shared by every language and edited in English
export const projectContentFields = ["name", "industry", "type", "summary", "description"] as const
// Content fields a language can leave untranslated, so they read in English. The name is required in every language
export const projectOptionalContentFields = ["industry", "type", "summary", "description"] as const

// The kind of record, and its and its contributions' content fields, as the AI translation describes them to the model
export const projectRecordKind = "project case study"
export const projectFieldDescriptions = {
  name: { label: "Name" },
  industry: { label: "Industry" },
  type: { label: "Type" },
  summary: { label: "Summary", markdown: true },
  description: { label: "Description", markdown: true },
} satisfies Record<(typeof projectContentFields)[number], FieldDescription>
export const contributionFieldDescriptions = (teamMemberName: string) =>
  ({ description: { label: `Contribution of team member ${teamMemberName}`, markdown: true } }) satisfies Record<"description", FieldDescription>

// What a translation validates: the project's and its contributions' content, as the shared fields are read-only outside
// English (useTranslationResolver)
export const projectContentSchema = staticSchema
  .pick({ name: true, industry: true, type: true, summary: true, description: true })
  .extend({ teamMembers: z.array(teamMemberSchema.pick({ description: true })).optional() })

// Whether a contribution has English content to translate: one without a description has none, so its translation
// status doesn't count
export const contributionHasEnglish = (contribution: { description?: string | null }) => Boolean(contribution.description?.trim())

export type ProjectLocationEnum = z.infer<typeof locationEnum>
export type ProjectFormSchema = z.infer<typeof staticSchema>
export type ProjectTeamMemberSchema = z.infer<typeof teamMemberSchema>
