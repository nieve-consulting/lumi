import { businessConfigOf, getBusinessSettings } from "@/services/businessSettings"
import type { Queryable } from "@/services/db"
import { NEUTRAL_BUSINESS_NAME, type BusinessConfig } from "@lumi/shared-contracts/business"

// The shared wording for naming the business, also used by the web app's helper prompts
export { NEUTRAL_BUSINESS_NAME, possessive } from "@lumi/shared-contracts/business"

// The business this installation represents, as the agents and the MCP server read it: its settings record (see
// src/services/businessSettings.ts) with the defaults filled in, split into the public configuration and the server-only
// agent guidance. Null until the onboarding wizard sets the installation up.
//
// Kept in memory per process for a short time, so an admin's edit reaches running agents and MCP servers within
// CACHE_TTL_MS. Between edits every read returns the same object, so what is built from it (the system prompt, the tool
// definitions) stays byte-identical and keeps OpenAI's prompt cache

const CACHE_TTL_MS = 30_000

let cached: { config: BusinessConfig; updatedAt: number; expiresAt: number } | undefined
// Concurrent reads of an expired cache share one query
let loading: Promise<BusinessConfig | null> | undefined

async function load(db: Queryable) {
  const record = await getBusinessSettings(db)
  // Not cached: the installation takes conversations as soon as the wizard completes
  if (!record) {
    cached = undefined
    return null
  }

  const updatedAt = record.updated_at.getTime()
  let config = cached?.updatedAt === updatedAt ? cached.config : undefined
  if (!config) {
    try {
      config = businessConfigOf(record)
    } catch (error) {
      throw new Error("The saved business settings are no longer valid: an admin must correct them in the settings", { cause: error })
    }
  }
  cached = { config, updatedAt, expiresAt: Date.now() + CACHE_TTL_MS }
  return config
}

// Never send the agent section to a client: only its public section is for visitors
export function businessConfig(db: Queryable): Promise<BusinessConfig | null> {
  if (cached && Date.now() < cached.expiresAt) return Promise.resolve(cached.config)

  loading ??= load(db).finally(() => {
    loading = undefined
  })
  return loading
}

// For code that only runs once the installation is set up, such as a conversation's turns
export async function requireBusinessConfig(db: Queryable): Promise<BusinessConfig> {
  const config = await businessConfig(db)
  if (!config) throw new Error("The installation isn't set up yet")
  return config
}

// The business's name, or NEUTRAL_BUSINESS_NAME before it is set up. Only names things, such as the MCP server's tool
// descriptions, so it never fails: when the settings can't be read or no longer parse it keeps the last name it read, or
// the neutral one, rather than taking down what only needs the name
export async function businessName(db: Queryable): Promise<string> {
  try {
    return (await businessConfig(db))?.public.businessName ?? NEUTRAL_BUSINESS_NAME
  } catch (error) {
    console.error("Couldn't read the business name, so the last known one is used", error)
    return cached?.config.public.businessName ?? NEUTRAL_BUSINESS_NAME
  }
}
