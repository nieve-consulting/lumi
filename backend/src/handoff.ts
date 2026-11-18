import { channelAvailability } from "@/handoff/delivery"
import type { Queryable } from "@/services/db"
import { getHandoffSettings, handoffConfigOf } from "@/services/handoffSettings"
import { DEFAULT_HANDOFF_CONFIG, type HandoffConfig } from "@lumi/shared-contracts/handoff"

// How conversations are handed to the business, as the agents read it: the handoff settings record (see
// src/services/handoffSettings.ts) parsed into the public handoff and the server-only delivery channels, or
// DEFAULT_HANDOFF_CONFIG until an admin saves them.
//
// Kept in memory per process for a short time like the business settings (src/business.ts), so an admin's edit reaches
// running agents within CACHE_TTL_MS. Between edits every read returns the same object, so the system prompt built from it
// stays byte-identical and keeps OpenAI's prompt cache. Never send the channels to a client: only the public section is for
// visitors

const CACHE_TTL_MS = 30_000

// Enquiries are only offered while a saved channel can deliver on this server: a channel whose type isn't available here
// (email without EMAIL_FROM) fails every delivery, so with none available the form isn't shown, the system prompt doesn't
// promise it and POST enquiry answers 503. Availability comes from the environment, so it is constant per process and the
// config stays the same object between edits
function usable(config: HandoffConfig): HandoffConfig {
  if (!config.public.enquiry || config.channels.some(({ type }) => channelAvailability(type).available)) return config

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { enquiry, ...offered } = config.public
  console.error("Enquiries are on but no delivery channel can deliver on this server, so they aren't offered")
  return { ...config, public: offered }
}

let cached: { config: HandoffConfig; updatedAt: number | null; expiresAt: number } | undefined
// Concurrent reads of an expired cache share one query
let loading: Promise<HandoffConfig> | undefined

async function load(db: Queryable) {
  const record = await getHandoffSettings(db)
  const updatedAt = record?.updated_at.getTime() ?? null

  let config = cached?.updatedAt === updatedAt ? cached.config : undefined
  if (!config) {
    if (!record) {
      config = DEFAULT_HANDOFF_CONFIG
    } else {
      try {
        config = usable(handoffConfigOf(record))
      } catch (error) {
        // Conversations keep going with the contact link rather than failing every turn until an admin corrects them
        console.error("The saved handoff settings are no longer valid, so the defaults apply until an admin corrects them", error)
        config = DEFAULT_HANDOFF_CONFIG
      }
    }
  }
  cached = { config, updatedAt, expiresAt: Date.now() + CACHE_TTL_MS }
  return config
}

export function handoffConfig(db: Queryable): Promise<HandoffConfig> {
  if (cached && Date.now() < cached.expiresAt) return Promise.resolve(cached.config)

  loading ??= load(db).finally(() => {
    loading = undefined
  })
  return loading
}
