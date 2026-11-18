import { z } from "zod"

// Knowledge the business maintains for Lumi besides its website: the structured sources (team members, projects, clients,
// capabilities and job openings) each installation turns on or off and names in its own words, and the limits of a website
// crawl

// The structured sources, generic objects any service business can use: the people on its team, the projects (work, cases)
// it shows, its clients, the capabilities (skills, specialities, practice areas) of its team members and projects, and the
// job openings it recruits for
export const SOURCE_KEYS = ["teamMembers", "projects", "clients", "capabilities", "jobOpenings"] as const

export type SourceKey = (typeof SOURCE_KEYS)[number]

// Which structured sources are on, in Settings → Knowledge sources. A source that is off is hidden from the admin navigation,
// its records leave every tool result, and neither the chat nor the MCP server offers or mentions it. Its records are kept.
// Until an admin saves them, a source is on when it has a published record (capabilities: when one is linked to a published
// team member or project), so an installation that already uses one keeps it and a new one starts without any
export type StructuredSources = Record<SourceKey, boolean>

// The sources as everything that reads them uses them: capabilities only belong to team members and projects, so they are off
// while both are, whatever their own switch says. The switch itself is kept, so turning team members or projects back on
// restores them
export function sourcesInUse<T extends StructuredSources>(sources: T): T {
  return { ...sources, capabilities: sources.capabilities && (sources.teamMembers || sources.projects) }
}

// How the installation names a source, in English: the admin interface, the chat's instructions and tool descriptions and the
// MCP server use these words. The chat model translates them for visitors writing in other languages
export type SourceLabel = { singular: string; plural: string }

export type SourceLabels = Record<SourceKey, SourceLabel>

export const DEFAULT_SOURCE_LABELS: SourceLabels = {
  teamMembers: { singular: "Team member", plural: "Team members" },
  projects: { singular: "Project", plural: "Projects" },
  clients: { singular: "Client", plural: "Clients" },
  capabilities: { singular: "Capability", plural: "Capabilities" },
  jobOpenings: { singular: "Job opening", plural: "Job openings" },
}

export const SOURCE_LABEL_MAX_LENGTH = 40

const labelText = z.string().trim().min(1, "Enter a label").max(SOURCE_LABEL_MAX_LENGTH, `Use at most ${SOURCE_LABEL_MAX_LENGTH} characters`)

export const sourceLabelSchema = z.object({ singular: labelText, plural: labelText })

// The labels an admin saves: every source's, checked like the admin form does
export const sourceLabelsSchema = z.object(
  Object.fromEntries(SOURCE_KEYS.map((key) => [key, sourceLabelSchema])) as Record<SourceKey, typeof sourceLabelSchema>
)

// The labels of every source: those saved, the defaults for the rest. A saved label that no longer passes the checks falls
// back to its default rather than reaching a prompt
export function sourceLabels(saved: unknown): SourceLabels {
  const record = saved && typeof saved === "object" ? (saved as Record<string, unknown>) : {}
  return Object.fromEntries(
    SOURCE_KEYS.map((key) => {
      const parsed = sourceLabelSchema.safeParse(record[key])
      return [key, parsed.success ? parsed.data : DEFAULT_SOURCE_LABELS[key]]
    })
  ) as SourceLabels
}

// A label inside a sentence, e.g. "our consultants". Kept as written when it looks like a name or an acronym ("UX Designers",
// "QA"), lowercased otherwise
export function inSentence(label: string) {
  const words = label.split(/\s+/)
  return words.slice(1).some((word) => /^[A-Z]/.test(word)) || /^[A-Z]{2,}/.test(label) ? label : label.toLowerCase()
}

// What the chat and the MCP server answer from: the structured sources that are on and their labels. The website is always
// searched
export type KnowledgeSources = StructuredSources & {
  labels: SourceLabels
}

// Where a job opening's work happens, shared by every language
export const JOB_WORK_MODES = ["REMOTE", "HYBRID", "ONSITE"] as const

export type JobWorkMode = (typeof JOB_WORK_MODES)[number]

// How the admin and the chat's English text name each work mode
export const JOB_WORK_MODE_LABELS: Record<JobWorkMode, string> = { REMOTE: "Remote", HYBRID: "Hybrid", ONSITE: "On-site" }

// What the chat's job opening card renders (card_type "job_opening"): a published opening in the visitor's language, its text
// falling back to English. The card links to application_url, or to the careers page from the business settings without one
export type JobOpeningCard = {
  id: string
  title: string
  summary: string
  // Markdown
  description: string | null
  location: string
  work_mode: JobWorkMode
  application_url: string | null
  // ISO 8601 date the opening was posted
  posted_at: string
}

// Limits of a website crawl (see https://docs.lumi.nieve.ai/configuration/knowledge). Pages beyond MAX are left out and the
// crawl says so
export const WEBSITE_CRAWL_LIMITS = {
  // Pages listed by the sitemap, after exclusions, that a crawl checks
  maxPages: 1_000,
  // Nested sitemaps a sitemap index may list
  maxSitemaps: 50,
  // Per sitemap or page
  maxBytes: 5 * 1024 * 1024,
  timeoutMs: 15_000,
} as const
