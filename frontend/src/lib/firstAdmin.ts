import { adminEmailSchema, adminNameSchema, adminPasswordSchema } from "@lumi/shared-contracts/adminAccounts"
import type { BusinessSettingsProblem } from "@lumi/shared-contracts/business"

// The onboarding wizard's first admin (local sign-in mode), checked with the API's rules, for the wizard and its server
// action alike. Problems name the fields as the API does: firstAdmin.email, firstAdmin.name, firstAdmin.password
const FIELDS = { email: adminEmailSchema, name: adminNameSchema, password: adminPasswordSchema } as const

export function firstAdminProblems(admin: { email?: unknown; name?: unknown; password?: unknown }): BusinessSettingsProblem[] {
  return Object.entries(FIELDS).flatMap(([field, schema]) => {
    const result = schema.safeParse(admin[field as keyof typeof FIELDS])
    return result.success ? [] : [{ field: `firstAdmin.${field}`, message: result.error.issues[0]?.message ?? "Invalid" }]
  })
}
