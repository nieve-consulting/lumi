import "server-only"

import { config } from "@/config"

// The web app's public URL, for links and images used outside the browser, e.g. in the resume PDF: APP_BASE_URL in a
// self-hosted installation, else the Vercel production domain over https, as Vercel serves it (the PDF renderer only loads https
// images from outside the app), else the local app
function baseUrl() {
  const appBaseUrl = process.env.APP_BASE_URL?.trim().replace(/\/+$/, "")
  if (appBaseUrl) return appBaseUrl
  const vercelDomain = process.env.VERCEL_PROJECT_PRODUCTION_URL?.trim()
  return vercelDomain ? `https://${vercelDomain}` : "http://localhost:3000"
}

// The agents API as the server reaches it. NEXT_PUBLIC_AGENTS_ENDPOINT is the browser's, which may be a path on the app's own
// origin (e.g. /agents behind a reverse proxy) that the server can't fetch, so AGENTS_INTERNAL_ENDPOINT can name another
// address, e.g. one on a private network. The admin routes are next to /agents
function agentsServerEndpoint() {
  return (process.env.AGENTS_INTERNAL_ENDPOINT?.trim() || config.agents.uri).replace(/\/+$/, "")
}

export const serverConfig = {
  baseUrl: baseUrl(),
  apiKey: process.env.API_KEY || "",
  apiEndpoint: process.env.API_ENDPOINT || "",
  agentsEndpoint: agentsServerEndpoint(),
  // Admin routes of the agents API, next to /agents and called with the API key
  agentsAdminEndpoint: agentsServerEndpoint().replace(/\/agents$/, "/admin"),
  langfuse: {
    baseUrl: (process.env.LANGFUSE_BASE_URL || "https://cloud.langfuse.com").replace(/\/$/, ""),
    projectId: process.env.LANGFUSE_PROJECT_ID || "",
  },
}

// Langfuse session of a conversation (traced with sessionId = threadId), or undefined when Langfuse is not configured
export function getLangfuseSessionUrl(threadId: string) {
  const { baseUrl, projectId } = serverConfig.langfuse
  return projectId ? `${baseUrl}/project/${encodeURIComponent(projectId)}/sessions/${encodeURIComponent(threadId)}` : undefined
}
