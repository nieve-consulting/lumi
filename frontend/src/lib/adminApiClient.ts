import "server-only"

import { getClient } from "./apiClient"
import { requireAdminAccess } from "./auth/admin"

// GraphQL client for admin pages and server actions: checks admin access before any call with the API key. Public callers
// (website PDFs, media, the chat) use getClient directly
export async function getAdminClient() {
  await requireAdminAccess()
  return getClient()
}
