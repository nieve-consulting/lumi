import "server-only"

import type { ThreadMessagesResponse } from "@lumi/shared-contracts/pre-sales"

import { requireAdminAccess } from "./auth/admin"
import { serverConfig } from "./serverConfig"

// Admin routes of the agents API, only called server-to-server with the API key

// Callers check admin access first: requireAdminAccess in pages and server actions, adminRouteError in route handlers (which
// answers with an error response instead of redirecting)
export function fetchAgentsAdmin(path: string, init?: RequestInit) {
  return fetch(`${serverConfig.agentsAdminEndpoint}${path}`, {
    ...init,
    headers: { ...init?.headers, Authorization: serverConfig.apiKey },
    cache: "no-store",
  })
}

export async function getThreadMessages(threadId: string) {
  await requireAdminAccess()
  const response = await fetchAgentsAdmin(`/pre-sales/threads/${encodeURIComponent(threadId)}/messages`)
  if (!response.ok) {
    throw new Error(`Failed to load the thread messages: ${response.status} ${await response.text()}`)
  }

  const { messages }: ThreadMessagesResponse = await response.json()
  return messages
}
