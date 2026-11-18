import "server-only"

import { JWT } from "google-auth-library"

import { authConfig } from "./config"

const DIRECTORY_SCOPE = "https://www.googleapis.com/auth/admin.directory.group.member.readonly"
// Deadline of a whole membership check, including the access token request (which has no timeout of its own and retries)
const CHECK_TIMEOUT_MS = 5000

export class MembershipCheckError extends Error {}

// One client per process: its JWT keeps the access token until it expires
let directoryClient: JWT | undefined

function getDirectoryClient() {
  if (!directoryClient) {
    // Callers only check membership once isAuthConfigured(); this narrows the key's type
    const { key, impersonatedUser } = authConfig.directory
    if (!key) {
      throw new MembershipCheckError("The Google Directory credentials are not configured")
    }

    directoryClient = new JWT({ email: key.clientEmail, key: key.privateKey, scopes: [DIRECTORY_SCOPE], subject: impersonatedUser })
  }

  return directoryClient
}

// Results per identity and group, kept longer for members than for non-members; each server instance checks again with Google
// once its entry expires. Failed checks are not kept
const memberships = new Map<string, { isMember: boolean; expiresAt: number }>()
const pending = new Map<string, Promise<boolean>>()

function withTimeout<T>(promise: Promise<T>, ms: number) {
  let timer: NodeJS.Timeout | undefined
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`Timed out after ${ms} ms`)), ms)
  })
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer))
}

function responseStatus(error: unknown) {
  return (error as { response?: { status?: number } }).response?.status
}

// Asks Google whether the member is in the group. hasMember resolves nested membership within one domain only: when the
// member and the group are in different domains and the member is not a direct member, it answers 400 Invalid input, so the
// direct membership lookup (members.get, 404 when absent) decides instead
async function lookUpMembership(groupKey: string, memberKey: string, signal: AbortSignal) {
  const client = getDirectoryClient()
  const groupUrl = `https://admin.googleapis.com/admin/directory/v1/groups/${encodeURIComponent(groupKey)}`

  try {
    const response = await client.request<{ isMember?: boolean }>({ url: `${groupUrl}/hasMember/${encodeURIComponent(memberKey)}`, signal })
    return response.data.isMember === true
  } catch (error) {
    if (responseStatus(error) !== 400) {
      throw error
    }
  }

  try {
    await client.request({ url: `${groupUrl}/members/${encodeURIComponent(memberKey)}`, signal })
    return true
  } catch (error) {
    if (responseStatus(error) === 404) {
      return false
    }
    throw error
  }
}

async function hasMember(groupKey: string, memberKey: string) {
  try {
    return await withTimeout(lookUpMembership(groupKey, memberKey, AbortSignal.timeout(CHECK_TIMEOUT_MS)), CHECK_TIMEOUT_MS)
  } catch (error) {
    if (error instanceof MembershipCheckError) {
      throw error
    }
    // Do not log the error object: it can include the request and its access token
    const status = responseStatus(error)
    console.error(`[Auth]: Google Directory membership check failed${status ? ` with status ${status}` : ""}: ${(error as Error).message}`)
    throw new MembershipCheckError("The Google Directory membership check failed")
  }
}

// Whether the Google account (its `sub`, which is also its Directory user ID) is a direct or nested member of the admin group.
// Checking by ID, not email, keeps the check on the account that signed in even if its address is renamed or reassigned.
// Nested membership only counts when the member and the group are in the same domain; members from other domains must be direct
// members. Only call it once isAuthConfigured(). Throws MembershipCheckError when the check cannot be completed
export async function isAdminGroupMember(sub: string) {
  const groupKey = authConfig.adminGroup
  const key = `${groupKey}|${sub}`
  const cached = memberships.get(key)
  if (cached && cached.expiresAt > Date.now()) {
    return cached.isMember
  }
  memberships.delete(key)

  let check = pending.get(key)
  if (!check) {
    check = hasMember(groupKey, sub).finally(() => pending.delete(key))
    pending.set(key, check)
  }

  const isMember = await check
  memberships.set(key, { isMember, expiresAt: Date.now() + (isMember ? authConfig.membershipCacheMs : authConfig.nonMembershipCacheMs) })

  return isMember
}
