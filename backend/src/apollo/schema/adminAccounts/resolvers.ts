import { requireInternal } from "@/apollo/access"
import type { Resolvers } from "@/generated/graphql"
import {
  AdminAccountExistsError,
  AdminAccountInputError,
  AdminAccountNotFoundError,
  changeAdminPassword,
  createAdminAccount,
  deleteAdminAccount,
  getAdminAccount,
  hasAdminAccounts,
  InvalidAdminCredentialsError,
  LastAdminAccountError,
  listAdminAccounts,
  verifyAdminCredentials,
  type AdminAccountRecord,
} from "@/services/adminAccounts"
import { AdminSignInThrottledError } from "@/services/adminSignInThrottle"
import { GraphQLError } from "graphql"

// The email and password admin accounts (src/services/adminAccounts.ts), for a web app signing admins in itself
// (ADMIN_AUTH_PROVIDER=local). Like the rest of the API, only the web app's server calls them, with the API key; it checks
// admin access before calling adminAccounts, createAdminAccount and deleteAdminAccount. Generated API keys may use none but
// hasAdminAccounts: src/apollo/access.ts refuses them, and checking here as well covers any change there. Passwords are never
// returned but for the temporary password of a new account, once

export function toAdminAccount(record: AdminAccountRecord) {
  return {
    id: record.id,
    email: record.email,
    name: record.name,
    mustChangePassword: record.must_change_password,
    createdAt: record.created_at.toISOString(),
    lastSignInAt: record.last_sign_in_at?.toISOString() ?? null,
    passwordChangedAt: record.password_changed_at.toISOString(),
  }
}

// The admin account errors by their codes. Anything else is rethrown as is
export function asAdminAccountError(error: unknown): never {
  if (error instanceof AdminAccountInputError) {
    throw new GraphQLError(error.message, { extensions: { code: "BAD_USER_INPUT", problems: error.problems } })
  }
  if (error instanceof AdminAccountExistsError) throw new GraphQLError(error.message, { extensions: { code: "ADMIN_EXISTS" } })
  if (error instanceof LastAdminAccountError) throw new GraphQLError(error.message, { extensions: { code: "LAST_ADMIN" } })
  if (error instanceof AdminAccountNotFoundError) throw new GraphQLError(error.message, { extensions: { code: "NOT_FOUND" } })
  if (error instanceof InvalidAdminCredentialsError) throw new GraphQLError(error.message, { extensions: { code: "INVALID_CREDENTIALS" } })
  if (error instanceof AdminSignInThrottledError) {
    throw new GraphQLError(error.message, { extensions: { code: "RATE_LIMITED", retryAfterSeconds: error.retryAfterSeconds } })
  }
  throw error
}

export const adminAccountsResolvers: Resolvers = {
  Query: {
    hasAdminAccounts: (_, __, context) => hasAdminAccounts(context.drizzle),
    adminAccounts: async (_, __, context) => {
      requireInternal(context)
      return (await listAdminAccounts(context.drizzle)).map(toAdminAccount)
    },
    adminAccount: async (_, { id }, context) => {
      requireInternal(context)
      const record = await getAdminAccount(context.drizzle, id)
      return record && toAdminAccount(record)
    },
  },
  Mutation: {
    verifyAdminCredentials: async (_, { email, password, clientIp }, context) => {
      requireInternal(context)
      try {
        const record = await verifyAdminCredentials(context.drizzle, { email, password, clientIp })
        return record && toAdminAccount(record)
      } catch (error) {
        asAdminAccountError(error)
      }
    },
    createAdminAccount: async (_, { input }, context) => {
      requireInternal(context)
      try {
        const { account, temporaryPassword } = await createAdminAccount(context.drizzle, input)
        return { account: toAdminAccount(account), temporaryPassword }
      } catch (error) {
        asAdminAccountError(error)
      }
    },
    deleteAdminAccount: async (_, { id }, context) => {
      requireInternal(context)
      try {
        await deleteAdminAccount(context.drizzle, id)
        return true
      } catch (error) {
        asAdminAccountError(error)
      }
    },
    changeAdminPassword: async (_, { id, currentPassword, newPassword }, context) => {
      requireInternal(context)
      try {
        return toAdminAccount(await changeAdminPassword(context.drizzle, { id, currentPassword, newPassword }))
      } catch (error) {
        asAdminAccountError(error)
      }
    },
  },
}
