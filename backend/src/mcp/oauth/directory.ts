import { JWT } from "google-auth-library"

import { mcpConfig } from "../config"

// Google Workspace group membership, the team permission behind every protected MCP call. Mirrors the admin interface's
// check (frontend/src/lib/auth/directory.ts): by account id, with nested membership only within the group's domain

const DIRECTORY_SCOPE = "https://www.googleapis.com/auth/admin.directory.group.member.readonly"
// Deadline of a whole membership check, including the access token request (which has no timeout of its own and retries)
const CHECK_TIMEOUT_MS = 5000

export class MembershipCheckError extends Error {}

// One client per Lambda container: its JWT keeps the access token until it expires
let directoryClient: JWT | undefined

function getDirectoryClient() {
  if (!directoryClient) {
    const { key, impersonatedUser } = mcpConfig.directory
    if (!key) throw new MembershipCheckError("The Google Directory credentials are not configured")

    directoryClient = new JWT({ email: key.clientEmail, key: key.privateKey, scopes: [DIRECTORY_SCOPE], subject: impersonatedUser })
  }

  return directoryClient
}

// Results per account and group, kept longer for members than for non-members. Failed checks are not kept
const memberships = new Map<string, { isMember: boolean; expiresAt: number }>()
const pending = new Map<string, Promise<boolean>>()

function withTimeout<T>(promise: Promise<T>, ms: number) {
  let timer: NodeJS.Timeout | undefined
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`Timed out after ${ms} ms`)), ms)
  })
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer))
}

const responseStatus = (error: unknown) => (error as { response?: { status?: number } }).response?.status

// hasMember resolves nested membership within one domain only: for a member of another domain who is not a direct member it
// answers 400, so the direct membership lookup (404 when absent) decides instead
async function lookUpMembership(groupKey: string, memberKey: string, signal: AbortSignal) {
  const client = getDirectoryClient()
  const groupUrl = `https://admin.googleapis.com/admin/directory/v1/groups/${encodeURIComponent(groupKey)}`

  try {
    const response = await client.request<{ isMember?: boolean }>({ url: `${groupUrl}/hasMember/${encodeURIComponent(memberKey)}`, signal })
    return response.data.isMember === true
  } catch (error) {
    if (responseStatus(error) !== 400) throw error
  }

  try {
    await client.request({ url: `${groupUrl}/members/${encodeURIComponent(memberKey)}`, signal })
    return true
  } catch (error) {
    if (responseStatus(error) === 404) return false
    throw error
  }
}

async function hasMember(groupKey: string, memberKey: string) {
  try {
    return await withTimeout(lookUpMembership(groupKey, memberKey, AbortSignal.timeout(CHECK_TIMEOUT_MS)), CHECK_TIMEOUT_MS)
  } catch (error) {
    if (error instanceof MembershipCheckError) throw error
    // Do not log the error object: it can include the request and its access token
    const status = responseStatus(error)
    console.error(`[MCP]: Google Directory membership check failed${status ? ` with status ${status}` : ""}: ${(error as Error).message}`)
    throw new MembershipCheckError("The Google Directory membership check failed")
  }
}

// Whether the Google account (its `sub`, which is also its Directory user id) is a member of the group. Throws
// MembershipCheckError when the check cannot be completed
export async function isGroupMember(groupKey: string, sub: string) {
  const key = `${groupKey}|${sub}`
  const cached = memberships.get(key)
  if (cached && cached.expiresAt > Date.now()) return cached.isMember
  memberships.delete(key)

  let check = pending.get(key)
  if (!check) {
    check = hasMember(groupKey, sub).finally(() => pending.delete(key))
    pending.set(key, check)
  }

  const isMember = await check
  memberships.set(key, { isMember, expiresAt: Date.now() + (isMember ? mcpConfig.membershipCacheMs : mcpConfig.nonMembershipCacheMs) })

  return isMember
}

// Team permissions of an account: read for members of the team group, write for members of the write group
export async function teamPermissions(sub: string) {
  const { readGroup, writeGroup } = mcpConfig
  const [read, write] = await Promise.all([isGroupMember(readGroup, sub), writeGroup === readGroup ? undefined : isGroupMember(writeGroup, sub)])

  return { read, write: writeGroup === readGroup ? read : read && write === true }
}
