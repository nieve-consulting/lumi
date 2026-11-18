import type { Queryable } from "@/services/db"
import { getResumeSettings } from "@/services/resumeSettings"
import { DEFAULT_RESUME_SETTINGS } from "@lumi/shared-contracts/resume"

// Whether the installation offers team member resumes, as the MCP server reads it: the switch of the resume
// settings record (see src/services/resumeSettings.ts), or DEFAULT_RESUME_SETTINGS (on) until an admin saves them. While off,
// no tool returns a team member's pdf_url or promises a resume. Only the switch is read here: the logo and colours are the
// web app's, which renders the PDF and decides whether the chat's cards link it.
//
// Kept in memory per process for a short time like the business and knowledge settings (src/business.ts, src/knowledge.ts),
// so an admin's edit reaches running MCP servers within CACHE_TTL_MS. It is a boolean, so the tool definitions
// built from it stay byte-identical between edits and keep OpenAI's prompt cache.
//
// Fails safe: when the settings can't be read, the last value read is kept, or before any, resumes count as off, since
// offering a resume an admin turned off is worse than briefly not offering one. The fallback is cached like a read, so a
// failing database is asked (and the failure logged) once per CACHE_TTL_MS

const CACHE_TTL_MS = 30_000

let cached: { offered: boolean; expiresAt: number } | undefined
// Concurrent reads of an expired cache share one query
let loading: Promise<boolean> | undefined

async function load(db: Queryable) {
  let offered: boolean
  try {
    const record = await getResumeSettings(db)
    offered = record?.enabled ?? DEFAULT_RESUME_SETTINGS.enabled
  } catch (error) {
    offered = cached?.offered ?? false
    console.error(`Couldn't read the resume settings, so resumes count as ${offered ? "on, as last read" : "off"}`, error)
  }
  cached = { offered, expiresAt: Date.now() + CACHE_TTL_MS }
  return offered
}

// Never fails (see above). Pass the main database rather than a transaction: concurrent reads share the query
export function resumesOffered(db: Queryable): Promise<boolean> {
  if (cached && Date.now() < cached.expiresAt) return Promise.resolve(cached.offered)

  loading ??= load(db).finally(() => {
    loading = undefined
  })
  return loading
}
