import "server-only"

import type {
  AdminAccount,
  Mutation,
  MutationChangeAdminPasswordArgs,
  MutationVerifyAdminCredentialsArgs,
  Query,
  QueryAdminAccountArgs,
} from "@/generated/graphql"
import { gql } from "@apollo/client"
import { CombinedGraphQLErrors } from "@apollo/client/errors"

import { getClient } from "@/lib/apiClient"

// The email and password admin accounts of local mode (ADMIN_AUTH_PROVIDER=local), kept by the API. These calls use the API
// key without checking admin access: signing in, the session's own account and its password change come before it. Passwords
// only travel as GraphQL variables, never inside a query document

export type LocalAdminAccount = Pick<AdminAccount, "id" | "email" | "name" | "mustChangePassword" | "passwordChangedAt">

const ACCOUNT_FIELDS = gql`
  fragment LocalAdminAccountFields on AdminAccount {
    id
    email
    name
    mustChangePassword
    passwordChangedAt
  }
`

// The code and extensions of an API refusal, or undefined for anything else (network, server errors)
export function apiErrorOf(error: unknown) {
  if (!CombinedGraphQLErrors.is(error)) return undefined
  const extensions = error.errors[0]?.extensions
  return typeof extensions?.code === "string" ? { code: extensions.code, extensions } : undefined
}

// RATE_LIMITED: how long until another try, in whole minutes, at least one
export function retryAfterMinutes(extensions: Record<string, unknown> | undefined) {
  const seconds = Number(extensions?.retryAfterSeconds)
  return Number.isFinite(seconds) && seconds > 0 ? Math.ceil(seconds / 60) : undefined
}

export class SignInThrottledError extends Error {}

// The account for this email and password, or null when they don't match an account. Throws SignInThrottledError when the
// email or the client's network failed too often, and the API's error when it couldn't check them
export async function verifyAdminCredentials(email: string, password: string, clientIp: string | undefined) {
  try {
    const { data } = await getClient().mutate<Mutation, MutationVerifyAdminCredentialsArgs>({
      mutation: gql`
        ${ACCOUNT_FIELDS}
        mutation VerifyAdminCredentials($email: String!, $password: String!, $clientIp: String) {
          verifyAdminCredentials(email: $email, password: $password, clientIp: $clientIp) {
            ...LocalAdminAccountFields
          }
        }
      `,
      variables: { email, password, clientIp },
      fetchPolicy: "no-cache",
    })
    return (data?.verifyAdminCredentials ?? null) as LocalAdminAccount | null
  } catch (error) {
    if (apiErrorOf(error)?.code === "RATE_LIMITED") throw new SignInThrottledError("Too many failed sign-ins")
    throw error
  }
}

// The session's account, or null when it was removed. Asked of the API every time, never kept on a server instance, so a
// removal, a password change or a reset applies to every instance at once. Throws when the API doesn't answer
export async function findAdminAccount(id: string): Promise<LocalAdminAccount | null> {
  const { data } = await getClient().query<Query, QueryAdminAccountArgs>({
    query: gql`
      ${ACCOUNT_FIELDS}
      query LocalAdminAccount($id: ID!) {
        adminAccount(id: $id) {
          ...LocalAdminAccountFields
        }
      }
    `,
    variables: { id },
    fetchPolicy: "no-cache",
  })
  if (!data) throw new Error("The API answered without data")

  return (data.adminAccount ?? null) as LocalAdminAccount | null
}

export type ChangePasswordResult =
  | { ok: true }
  | { ok: false; field: "currentPassword" | "newPassword"; message: string }
  | { ok: false; code: "RATE_LIMITED"; retryAfterMinutes?: number }
  | { ok: false; code: "NOT_FOUND" | "FAILED" }

// Sets the account's new password once its current one is checked, which also ends a temporary password and every session
// of the account, the current one included: it signs in again with the new password
export async function changeAdminPassword(id: string, currentPassword: string, newPassword: string): Promise<ChangePasswordResult> {
  try {
    await getClient().mutate<Mutation, MutationChangeAdminPasswordArgs>({
      mutation: gql`
        mutation ChangeAdminPassword($id: ID!, $currentPassword: String!, $newPassword: String!) {
          changeAdminPassword(id: $id, currentPassword: $currentPassword, newPassword: $newPassword) {
            id
          }
        }
      `,
      variables: { id, currentPassword, newPassword },
      fetchPolicy: "no-cache",
    })
  } catch (error) {
    const refusal = apiErrorOf(error)
    switch (refusal?.code) {
      case "INVALID_CREDENTIALS":
        return { ok: false, field: "currentPassword", message: "Your current password is incorrect." }
      case "RATE_LIMITED":
        return { ok: false, code: "RATE_LIMITED", retryAfterMinutes: retryAfterMinutes(refusal.extensions) }
      case "NOT_FOUND":
        return { ok: false, code: "NOT_FOUND" }
      case "BAD_USER_INPUT": {
        const problems = Array.isArray(refusal.extensions.problems) ? (refusal.extensions.problems as { field?: string; message?: string }[]) : []
        const problem = problems.find(({ field }) => field === "newPassword") ?? problems[0]
        return { ok: false, field: "newPassword", message: problem?.message || "Choose a different password." }
      }
    }
    console.error("Changing an admin password failed", refusal?.code ?? (error as Error).message)
    return { ok: false, code: "FAILED" }
  }
  return { ok: true }
}

// Whether any admin account exists, so the onboarding wizard knows whether to ask for the first. Throws when the API doesn't
// answer
export async function hasAdminAccounts() {
  const { data } = await getClient().query<Query>({
    query: gql`
      query HasAdminAccounts {
        hasAdminAccounts
      }
    `,
    fetchPolicy: "no-cache",
  })
  if (typeof data?.hasAdminAccounts !== "boolean") throw new Error("The API answered without data")
  return data.hasAdminAccounts
}
