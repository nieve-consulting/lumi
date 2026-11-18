"use server"

import { revalidatePath } from "next/cache"
import { ApiKeyAccess, type Mutation, type MutationCreateApiKeyArgs, type MutationRevokeApiKeyArgs } from "@/generated/graphql"
import { gql } from "@apollo/client"

import { getAdminClient } from "@/lib/adminApiClient"
import { requireAdminAccess } from "@/lib/auth/admin"
import { apiErrorOf } from "@/lib/auth/localAccounts"

import { apiKeyNameSchema } from "./schema"

// API keys for the installation's other systems, managed by any admin. Only the web app's server can manage them: it calls
// the API with the installation's internal key, acting for the signed-in admin

export type CreateApiKeyResult =
  { ok: true; name: string; secret: string } | { ok: false; field: "name"; message: string } | { ok: false; error: string }

export type RevokeApiKeyResult = { ok: true } | { ok: false; error: string }

const ACCESS = new Set<string>(Object.values(ApiKeyAccess))

// Generates a key, whose secret is returned once: only its hash is stored
export async function createApiKey(input: { name: string; access: ApiKeyAccess }): Promise<CreateApiKeyResult> {
  const user = await requireAdminAccess()

  const name = apiKeyNameSchema.safeParse(input?.name)
  if (!name.success) return { ok: false, field: "name", message: name.error.issues[0]?.message ?? "Enter a name" }
  if (!ACCESS.has(input?.access)) return { ok: false, error: "Choose the key's access." }

  const client = await getAdminClient()
  try {
    const { data } = await client.mutate<Mutation, MutationCreateApiKeyArgs>({
      mutation: gql`
        mutation CreateApiKey($input: NewApiKeyInput!) {
          createApiKey(input: $input) {
            apiKey {
              id
              name
            }
            secret
          }
        }
      `,
      variables: { input: { name: name.data, access: input.access, createdBy: user.email } },
      fetchPolicy: "no-cache",
    })
    const created = data?.createApiKey
    if (!created) throw new Error("The API answered without data")
    revalidatePath("/admin/settings")
    return { ok: true, name: created.apiKey.name, secret: created.secret }
  } catch (error) {
    const refusal = apiErrorOf(error)
    if (refusal?.code === "BAD_USER_INPUT" && Array.isArray(refusal.extensions.problems)) {
      const [problem] = refusal.extensions.problems as { field?: string; message?: string }[]
      if (problem) return { ok: false, field: "name", message: problem.message || "Check the name" }
    }
    console.error("Creating an API key failed", refusal?.code ?? (error as Error).message)
    return { ok: false, error: "The key couldn't be created. Try again in a moment." }
  }
}

// Revokes a key: systems using it are refused from then on (on AWS, within five minutes)
export async function revokeApiKey(id: string): Promise<RevokeApiKeyResult> {
  await requireAdminAccess()
  if (typeof id !== "string" || !id) return { ok: false, error: "Choose a key to revoke." }

  const client = await getAdminClient()
  try {
    await client.mutate<Mutation, MutationRevokeApiKeyArgs>({
      mutation: gql`
        mutation RevokeApiKey($id: ID!) {
          revokeApiKey(id: $id)
        }
      `,
      variables: { id },
      fetchPolicy: "no-cache",
    })
  } catch (error) {
    const refusal = apiErrorOf(error)
    // Already revoked, e.g. by another admin: the list just catches up
    if (refusal?.code !== "NOT_FOUND") {
      console.error("Revoking an API key failed", refusal?.code ?? (error as Error).message)
      return { ok: false, error: "The key couldn't be revoked. Try again in a moment." }
    }
  }

  revalidatePath("/admin/settings")
  return { ok: true }
}
