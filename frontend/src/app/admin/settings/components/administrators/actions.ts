"use server"

import { revalidatePath } from "next/cache"
import type { Mutation, MutationCreateAdminAccountArgs, MutationDeleteAdminAccountArgs } from "@/generated/graphql"
import { gql } from "@apollo/client"
import { adminEmailSchema, adminNameSchema } from "@lumi/shared-contracts/adminAccounts"

import { getAdminClient } from "@/lib/adminApiClient"
import { requireAdminAccess } from "@/lib/auth/admin"
import { authConfig } from "@/lib/auth/config"
import { apiErrorOf } from "@/lib/auth/localAccounts"

// The admins of local sign-in mode, managed by any admin. The other modes have none

export type CreateAdministratorResult =
  { ok: true; email: string; temporaryPassword: string } | { ok: false; field: "email" | "name"; message: string } | { ok: false; error: string }

export type RemoveAdministratorResult = { ok: true } | { ok: false; error: string }

const NOT_LOCAL = "Admins are managed here only when Lumi signs admins in with an email and password."

// Adds an admin with a temporary password, which is returned once: they choose their own when they first sign in
export async function createAdministrator(input: { email: string; name?: string }): Promise<CreateAdministratorResult> {
  await requireAdminAccess()
  if (authConfig.mode !== "local") return { ok: false, error: NOT_LOCAL }

  const email = adminEmailSchema.safeParse(input?.email)
  if (!email.success) return { ok: false, field: "email", message: email.error.issues[0]?.message ?? "Enter an email address" }
  const name = adminNameSchema.safeParse(input?.name)
  if (!name.success) return { ok: false, field: "name", message: name.error.issues[0]?.message ?? "Invalid name" }

  const client = await getAdminClient()
  try {
    const { data } = await client.mutate<Mutation, MutationCreateAdminAccountArgs>({
      mutation: gql`
        mutation CreateAdminAccount($input: NewAdminAccountInput!) {
          createAdminAccount(input: $input) {
            account {
              id
              email
            }
            temporaryPassword
          }
        }
      `,
      variables: { input: { email: email.data, name: name.data ?? null } },
      fetchPolicy: "no-cache",
    })
    const created = data?.createAdminAccount
    if (!created) throw new Error("The API answered without data")
    revalidatePath("/admin/settings")
    return { ok: true, email: created.account.email, temporaryPassword: created.temporaryPassword }
  } catch (error) {
    const refusal = apiErrorOf(error)
    if (refusal?.code === "ADMIN_EXISTS") return { ok: false, field: "email", message: "There's already an admin with this email" }
    if (refusal?.code === "BAD_USER_INPUT" && Array.isArray(refusal.extensions.problems)) {
      const [problem] = refusal.extensions.problems as { field?: string; message?: string }[]
      if (problem) return { ok: false, field: problem.field === "name" ? "name" : "email", message: problem.message || "Check this field" }
    }
    console.error("Adding an admin failed", refusal?.code ?? (error as Error).message)
    return { ok: false, error: "The admin couldn't be added: the server didn't answer. Try again in a moment." }
  }
}

// Removes another admin. Never yourself, which the list doesn't offer, and never the last admin, which the API refuses
export async function removeAdministrator(id: string): Promise<RemoveAdministratorResult> {
  const user = await requireAdminAccess()
  if (authConfig.mode !== "local") return { ok: false, error: NOT_LOCAL }
  if (typeof id !== "string" || !id) return { ok: false, error: "Choose an admin to remove." }
  if (id === user.id) return { ok: false, error: "You can't remove your own account. Ask another admin to remove it." }

  const client = await getAdminClient()
  try {
    await client.mutate<Mutation, MutationDeleteAdminAccountArgs>({
      mutation: gql`
        mutation DeleteAdminAccount($id: ID!) {
          deleteAdminAccount(id: $id)
        }
      `,
      variables: { id },
      fetchPolicy: "no-cache",
    })
  } catch (error) {
    const refusal = apiErrorOf(error)
    if (refusal?.code === "LAST_ADMIN") return { ok: false, error: "Lumi needs at least one admin, so the last one can't be removed." }
    // Already removed, e.g. by another admin: the list just catches up
    if (refusal?.code !== "NOT_FOUND") {
      console.error("Removing an admin failed", refusal?.code ?? (error as Error).message)
      return { ok: false, error: "The admin couldn't be removed: the server didn't answer. Try again in a moment." }
    }
  }

  revalidatePath("/admin/settings")
  return { ok: true }
}
