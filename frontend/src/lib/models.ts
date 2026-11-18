import { WEBSITE_CRAWL_PURPOSE, type AdminPurpose } from "@lumi/shared-contracts/usage"

// OpenAI model for the admin editor "help improve" completion, same as WRITING_MODEL in backend/src/ai/models.ts
export const WRITING_MODEL = { model: "gpt-6.1-sol", reasoningEffort: "low" } as const

// Labels of the admin's model calls, one per purpose
const ADMIN_PURPOSE_LABELS: Record<AdminPurpose, string> = {
  "translate-record": "Record translation",
  "improve-text": "Writing assistant",
}

// Labels of the purposes the backend records (ModelPurpose in backend/src/ai/models.ts) and of the admin's model calls
export const PURPOSE_LABELS: Record<string, string> = {
  chat: "Agent replies",
  extraction: "State and meeting data",
  query: "Search queries",
  writing: "Summaries",
  embedding: "Search embeddings",
  ...ADMIN_PURPOSE_LABELS,
  [WEBSITE_CRAWL_PURPOSE]: "Website crawls",
}
