import { z } from "zod"

export const websiteSchema = z.object({
  name: z.string().max(256).min(1, { message: "Name is required" }),
  description: z.string().optional(),
  url: z.union([z.string().url({ message: "Invalid URL" }), z.string().length(0)]),
  sitemap: z.string().min(2, { message: "Sitemap is required" }),
  exclude_paths: z.array(z.object({ path: z.string().min(2, { message: "Path required" }) })).optional(),
})

export type WebsiteFormSchema = z.infer<typeof websiteSchema>
