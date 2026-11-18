"use client"

import { MIN_ADMIN_PASSWORD_LENGTH } from "@lumi/shared-contracts/adminAccounts"

import { firstAdminProblems } from "@/lib/firstAdmin"
import { TextField } from "@/components/BusinessSettings/fields"
import { errorsFromProblems, type FieldErrors } from "@/components/BusinessSettings/form"

// The onboarding wizard's first admin, in local sign-in mode: the account that signs in to the admin once setup is done.
// Problems name the fields as the API does (firstAdmin.email, firstAdmin.name, firstAdmin.password)

export type AdminForm = { email: string; name: string; password: string; confirmPassword: string }

export const emptyAdmin = (): AdminForm => ({ email: "", name: "", password: "", confirmPassword: "" })

export const ADMIN_STEP = {
  id: "admin",
  title: "Administrator",
  description: "The account you'll sign in to the admin with.",
  fields: ["firstAdmin"],
} as const

// Every problem with the admin, checked with the API's rules
export function validateAdmin(admin: AdminForm): FieldErrors {
  const errors: FieldErrors = errorsFromProblems(firstAdminProblems(admin))
  if (!errors["firstAdmin.password"] && admin.confirmPassword !== admin.password) {
    errors["firstAdmin.confirmPassword"] = "The passwords don't match"
  }
  return errors
}

export function adminSummary(admin: AdminForm) {
  return [
    { label: "Email", value: admin.email.trim() || "Not set" },
    { label: "Name", value: admin.name.trim() || "Not set" },
    { label: "Password", value: admin.password ? "Set" : "Not set" },
  ]
}

interface AdminStepFieldsProps {
  admin: AdminForm
  update: (patch: Partial<AdminForm>) => void
  errors: FieldErrors
}

export function AdminStepFields({ admin, update, errors }: AdminStepFieldsProps) {
  return (
    <>
      <TextField
        field="firstAdmin.email"
        label="Email"
        type="email"
        required
        maxLength={254}
        autoComplete="username"
        placeholder="admin@example.com"
        value={admin.email}
        onChange={(email) => update({ email })}
        errors={errors}
      />
      <TextField
        field="firstAdmin.name"
        label="Name"
        hint="Shown in the admin's list of admins."
        maxLength={100}
        autoComplete="name"
        value={admin.name}
        onChange={(name) => update({ name })}
        errors={errors}
      />
      <TextField
        field="firstAdmin.password"
        label="Password"
        hint={`At least ${MIN_ADMIN_PASSWORD_LENGTH} characters.`}
        type="password"
        required
        autoComplete="new-password"
        value={admin.password}
        onChange={(password) => update({ password })}
        errors={errors}
      />
      <TextField
        field="firstAdmin.confirmPassword"
        label="Confirm password"
        type="password"
        required
        autoComplete="new-password"
        value={admin.confirmPassword}
        onChange={(confirmPassword) => update({ confirmPassword })}
        errors={errors}
      />
    </>
  )
}
