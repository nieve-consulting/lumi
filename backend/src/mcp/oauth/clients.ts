import { safeFetch } from "@/utils/safeFetch"
import type { DbType } from "@db/db"
import { oauthClients } from "@db/schema"
import { eq } from "drizzle-orm"
import { z } from "zod"

import { mcpConfig } from "../config"
import { randomToken } from "./crypto"

// OAuth clients of the authorization server. All are public clients (PKCE, no secret):
// - Client ID Metadata Documents (preferred, used by ChatGPT): the client_id is an https URL serving the client's metadata,
//   fetched from public addresses only and cached briefly.
// - Dynamic Client Registration, kept for clients without CIMD support: registrations are stored in oauth_clients.
// Redirect URIs must match a registered one exactly and are limited to MCP_ALLOWED_REDIRECT_ORIGINS when it is set.

export interface OAuthClient {
  clientId: string
  name: string | null
  redirectUris: string[]
  // How the consent page names the client: CIMD clients are identified by the host serving their metadata
  verifiedHost: string | null
}

export class InvalidClientError extends Error {}

const CIMD_CACHE_MS = 10 * 60 * 1000
// Client ids are chosen by callers, so the cache is bounded: expired entries are dropped and then the oldest ones
const CIMD_CACHE_MAX_ENTRIES = 100
const cimdCache = new Map<string, { client: OAuthClient; expiresAt: number }>()

function cacheClient(client: OAuthClient) {
  const now = Date.now()
  cimdCache.delete(client.clientId)
  for (const [clientId, entry] of cimdCache) {
    if (entry.expiresAt <= now) cimdCache.delete(clientId)
  }
  // A Map iterates in insertion order, so the first keys are the oldest entries
  for (const clientId of cimdCache.keys()) {
    if (cimdCache.size < CIMD_CACHE_MAX_ENTRIES) break
    cimdCache.delete(clientId)
  }
  cimdCache.set(client.clientId, { client, expiresAt: now + CIMD_CACHE_MS })
}

function isLoopback(url: URL) {
  return url.protocol === "http:" && ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)
}

// Whether a redirect URI is acceptable for any client of this server
export function isAllowedRedirectUri(value: string) {
  let url: URL
  try {
    url = new URL(value)
  } catch {
    return false
  }

  if (url.hash || url.username || url.password) return false
  if (isLoopback(url)) return mcpConfig.allowLoopbackRedirects
  if (url.protocol !== "https:") return false

  return mcpConfig.allowedRedirectOrigins.length === 0 || mcpConfig.allowedRedirectOrigins.includes(url.origin)
}

const metadataDocumentSchema = z.object({
  client_id: z.string(),
  client_name: z.string().max(200).optional(),
  redirect_uris: z.array(z.string().max(2048)).min(1).max(10),
  token_endpoint_auth_method: z.string().optional(),
  token_endpoint_auth_methods_supported: z.array(z.string()).optional(),
})

function isMetadataDocumentUrl(clientId: string) {
  try {
    const url = new URL(clientId)
    return url.protocol === "https:" && url.pathname.length > 1 && !url.hash && !url.username && !url.password && !/\/\.\.?(\/|$)/.test(url.pathname)
  } catch {
    return false
  }
}

async function metadataDocumentClient(clientId: string): Promise<OAuthClient> {
  const cached = cimdCache.get(clientId)
  if (cached && cached.expiresAt > Date.now()) return cached.client

  let document: z.infer<typeof metadataDocumentSchema>
  try {
    const response = await safeFetch(clientId, {
      httpsOnly: true,
      maxRedirects: 0,
      timeoutMs: 5000,
      maxBytes: 10 * 1024,
      contentTypes: ["application/json"],
      accept: "application/json",
    })
    document = metadataDocumentSchema.parse(JSON.parse(response.body))
  } catch {
    throw new InvalidClientError("The client metadata document could not be fetched or is invalid.")
  }

  if (document.client_id !== clientId) throw new InvalidClientError("The client metadata document names a different client_id.")

  // This server only supports public clients; a client that can only use other methods cannot sign in here
  const methods = document.token_endpoint_auth_methods_supported ?? [document.token_endpoint_auth_method ?? "none"]
  if (!methods.includes("none")) throw new InvalidClientError("The client does not support public client authentication (none).")

  const client = { clientId, name: document.client_name ?? null, redirectUris: document.redirect_uris, verifiedHost: new URL(clientId).host }
  cacheClient(client)

  return client
}

export async function resolveClient(db: DbType, clientId: string): Promise<OAuthClient> {
  if (!clientId || clientId.length > 2048) throw new InvalidClientError("The client_id is missing or invalid.")
  if (isMetadataDocumentUrl(clientId)) return metadataDocumentClient(clientId)

  const [registered] = await db.select().from(oauthClients).where(eq(oauthClients.client_id, clientId))
  if (!registered) throw new InvalidClientError("The client is not registered.")

  return { clientId, name: registered.client_name, redirectUris: registered.redirect_uris, verifiedHost: null }
}

export const registrationSchema = z.object({
  redirect_uris: z.array(z.string().max(2048)).min(1).max(5),
  client_name: z.string().trim().max(100).optional(),
  token_endpoint_auth_method: z.string().optional(),
  grant_types: z.array(z.string()).optional(),
  response_types: z.array(z.string()).optional(),
})

export async function registerClient(db: DbType, metadata: z.infer<typeof registrationSchema>) {
  const clientId = `lumi-${randomToken(18)}`
  const [client] = await db
    .insert(oauthClients)
    .values({ client_id: clientId, client_name: metadata.client_name || null, redirect_uris: metadata.redirect_uris })
    .returning()

  return client
}
