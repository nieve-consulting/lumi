// The admin's own model calls, by their Langfuse trace names: the frontend makes them with the AI SDK and records each
// through the backend's recordAdminUsage mutation, which the dashboard reports under these purposes
export const ADMIN_PURPOSES = ["translate-record", "improve-text"] as const

export type AdminPurpose = (typeof ADMIN_PURPOSES)[number]

// Embeddings of the website crawls an admin starts from the websites page. The crawler records them with the admin's own
// calls, but not through recordAdminUsage
export const WEBSITE_CRAWL_PURPOSE = "crawl-website"
