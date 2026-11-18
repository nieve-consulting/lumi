import { z } from "zod"

import type { ServiceContext } from "./context"
import { ServiceError } from "./errors"
import type { DetailOptions } from "./pagination"
import { localizedAs, localizedShape } from "./records"
import { keyOf, loadContentOf } from "./translations"

// The company Lumi represents: a single record, public as a whole, as Lumi's chat tells visitors about it

// Schemas

export const publicCompanySchema = z.object({
  founding_story: z.string().nullable(),
  values: z.string().nullable(),
  mission: z.string().nullable(),
  vision: z.string().nullable(),
  location: z.string().describe("Where the company is based"),
  phone: z.string().describe("Contact phone number"),
  email: z.string().describe("Contact email address"),
  webpage: z.string().nullable().describe("The company's website"),
  ...localizedShape,
})

export type PublicCompany = z.infer<typeof publicCompanySchema>

// Public reads

export async function getPublicCompany(ctx: ServiceContext, { language }: Pick<DetailOptions, "language"> = {}): Promise<PublicCompany> {
  const record = await ctx.db.query.company.findFirst()
  if (!record) throw new ServiceError("not_found", "The company information has not been set up yet.")

  const content = await loadContentOf(ctx.db, "company", [record.id], language)
  const localized = content.localize(record, keyOf("company", record.id))

  return {
    founding_story: localized.founding_story,
    values: localized.values,
    mission: localized.mission,
    vision: localized.vision,
    location: record.location,
    phone: record.phone,
    email: record.email,
    webpage: record.webpage,
    ...localizedAs(localized),
  }
}
