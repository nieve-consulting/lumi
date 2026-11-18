import "server-only"

import { isPlaceholderSecret } from "@lumi/shared-contracts/secrets"

import { authConfig, authSecretProblem } from "@/lib/auth/config"
import { authMode } from "@/lib/auth/mode"
import { businessState } from "@/lib/businessState"
import { serverConfig } from "@/lib/serverConfig"
import { MIN_SETUP_TOKEN_LENGTH } from "@/lib/setupToken"

// The web app's health (GET /api/health): its own settings, and whether the GraphQL API and the agents API answer their
// /health. Public, so the answer has only check names and states; what's wrong and how to fix it goes to the server's log.
// On Vercel the backend runs on AWS Lambda behind API Gateway, which serves no /health, so only the settings are checked there

// "skipped": not checked where the service has no health endpoint, or none this server can reach
export type CheckState = "ok" | "unavailable" | "misconfigured" | "skipped"
export type HealthReport = { status: "ok" | "unavailable"; checks: { api: CheckState; agents: CheckState; config: CheckState } }

const TIMEOUT_MS = 2_000

// One report serves every request for this long, so polling the public route can't multiply requests to the backend
const REPORT_TTL_MS = 5_000

const isHttpUrl = (value: string) => {
  try {
    return ["http:", "https:"].includes(new URL(value).protocol)
  } catch {
    return false
  }
}

// The base URL of the agents service, whose /health is next to /agents, or undefined when the server has no absolute address
// for it, e.g. NEXT_PUBLIC_AGENTS_ENDPOINT=/agents without AGENTS_INTERNAL_ENDPOINT
function agentsServiceUrl() {
  const endpoint = serverConfig.agentsEndpoint
  return isHttpUrl(endpoint) ? endpoint.replace(/\/agents$/, "") : undefined
}

// What's wrong with the web app's settings that it can tell without asking anyone, each with how to fix it
export function staticConfigProblems(): string[] {
  const problems: string[] = []
  const env = process.env

  if (!serverConfig.apiEndpoint) {
    problems.push("API_ENDPOINT is not set: set it to the GraphQL API's base URL without /graphql, e.g. http://api:4000")
  } else if (!isHttpUrl(serverConfig.apiEndpoint)) {
    problems.push("API_ENDPOINT is not an absolute http(s) URL: set it to the GraphQL API's base URL without /graphql, e.g. http://api:4000")
  }
  if (!serverConfig.apiKey) problems.push("API_KEY is not set: set it to the backend's API_KEY")
  if (!agentsServiceUrl()) {
    problems.push(
      "The server has no absolute URL for the agents API: set AGENTS_INTERNAL_ENDPOINT to its /agents URL on the internal network, e.g. http://agents:4200/agents"
    )
  }

  const secretProblem = authSecretProblem()
  if (secretProblem) problems.push(secretProblem)

  // On Vercel, NextAuth and the public URL come from Vercel's own variables
  if (!env.VERCEL) {
    const appBaseUrl = env.APP_BASE_URL?.trim()
    const nextAuthUrl = env.NEXTAUTH_URL?.trim()
    if (!appBaseUrl || !isHttpUrl(appBaseUrl)) {
      problems.push("APP_BASE_URL is not set to an absolute http(s) URL: set it to the public URL visitors open, e.g. https://lumi.example.com")
    }
    if (!nextAuthUrl || !isHttpUrl(nextAuthUrl)) {
      problems.push("NEXTAUTH_URL is not set to an absolute http(s) URL: set it to the same public URL as APP_BASE_URL")
    }
    if (appBaseUrl && nextAuthUrl && isHttpUrl(appBaseUrl) && isHttpUrl(nextAuthUrl) && new URL(appBaseUrl).origin !== new URL(nextAuthUrl).origin) {
      problems.push("NEXTAUTH_URL and APP_BASE_URL name different origins: set both to the public URL visitors open")
    }
  }

  const mode = authMode()
  if (!mode) {
    problems.push('ADMIN_AUTH_PROVIDER is not "local" or "workspace": set it to "local" for email and password admin accounts')
  } else if (mode === "workspace") {
    const missing = [
      !authConfig.google.clientId && "GOOGLE_CLIENT_ID",
      !authConfig.google.clientSecret && "GOOGLE_CLIENT_SECRET",
      !authConfig.allowedDomains.length && "ADMIN_ALLOWED_DOMAINS",
      !authConfig.adminGroup && "ADMIN_GOOGLE_GROUP",
      !authConfig.directory.key && "GOOGLE_DIRECTORY_CREDENTIALS (a base64-encoded service account JSON key)",
      !authConfig.directory.impersonatedUser && "GOOGLE_DIRECTORY_IMPERSONATED_USER",
    ].filter(Boolean)
    if (missing.length) {
      problems.push(
        `ADMIN_AUTH_PROVIDER is "workspace" but ${missing.join(", ")} ${missing.length > 1 ? "are" : "is"} missing: set them, or use "local"`
      )
    }
  }

  if (!env.OPENAI_API_KEY) problems.push("OPENAI_API_KEY is not set: the admin's AI writing and translation fail without it")

  return problems
}

// In local sign-in mode, the onboarding wizard creates the first admin, so it can't be completed without a setup token. In
// any mode a token too short or still the placeholder locks the wizard. Only checked while the business isn't set up; unknown
// while the API doesn't answer
async function setupTokenProblem(): Promise<string | undefined> {
  const token = process.env.LUMI_SETUP_TOKEN?.trim()
  const fix = "generate one with `openssl rand -hex 24`"
  const problem = !token
    ? authMode() === "local"
      ? `LUMI_SETUP_TOKEN is not set, so nobody can complete the onboarding wizard: ${fix}`
      : undefined
    : isPlaceholderSecret(token)
      ? `LUMI_SETUP_TOKEN is still the placeholder from deploy/.env.example, so the onboarding wizard accepts no token: ${fix}`
      : token.length < MIN_SETUP_TOKEN_LENGTH
        ? `LUMI_SETUP_TOKEN is shorter than ${MIN_SETUP_TOKEN_LENGTH} characters: ${fix}`
        : undefined
  if (!problem || (await businessState())?.setUp !== false) return undefined
  return problem
}

type ServiceCheck = { state: CheckState; problem?: string }
const SKIPPED: ServiceCheck = { state: "skipped" }

// Whether a service's /health answers ok, with why not for the log
async function checkService(name: string, baseUrl: string | undefined): Promise<ServiceCheck> {
  if (process.env.VERCEL) return SKIPPED
  // The config problems say which setting is missing
  if (!baseUrl) return { state: "misconfigured" }
  const url = `${baseUrl}/health`
  try {
    const response = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(TIMEOUT_MS) })
    const body = (await response.json().catch(() => null)) as { status?: unknown; checks?: unknown } | null
    if (response.ok && body?.status === "ok") return { state: "ok" }
    return { state: "unavailable", problem: `${name}: ${url} answered ${response.status} ${JSON.stringify(body?.checks ?? body)}` }
  } catch (error) {
    const cause = (error as Error & { cause?: Error }).cause
    return { state: "unavailable", problem: `${name}: ${url} can't be reached: ${(error as Error).message}${cause ? ` (${cause.message})` : ""}` }
  }
}

// On globalThis, so the log and the latest report are shared by each server bundle's copy of this module
const state = globalThis as { lumiHealthLogged?: string; lumiHealthReport?: { at: number; report: Promise<HealthReport> } }

// Logs what's wrong when it changes, so a container health check polling the route doesn't repeat it
function logChanges(problems: string[]) {
  const logged = problems.join("\n")
  if (logged === (state.lumiHealthLogged ?? "")) return
  state.lumiHealthLogged = logged
  if (problems.length) console.error(`[Health]: The web app is not healthy:\n- ${problems.join("\n- ")}`)
  else console.info("[Health]: The web app is healthy")
}

// The latest report while it is fresh, else a new one; requests that arrive while it is being made share it
export function checkHealth(): Promise<HealthReport> {
  const cached = state.lumiHealthReport
  if (cached && Date.now() - cached.at < REPORT_TTL_MS) return cached.report

  const report = buildReport()
  state.lumiHealthReport = { at: Date.now(), report }
  return report
}

// Whether the GraphQL API is reached through the app's own public address, e.g. the local proxy in development, whose /health
// is this web app's page rather than the API's
function apiBehindAppOrigin(apiBaseUrl: string) {
  const appBaseUrl = process.env.APP_BASE_URL?.trim()
  return Boolean(appBaseUrl && isHttpUrl(appBaseUrl) && new URL(appBaseUrl).origin === new URL(apiBaseUrl).origin)
}

async function buildReport(): Promise<HealthReport> {
  const apiBaseUrl = isHttpUrl(serverConfig.apiEndpoint) ? serverConfig.apiEndpoint.replace(/\/+$/, "") : undefined
  const [api, agents, setupToken] = await Promise.all([
    apiBaseUrl && apiBehindAppOrigin(apiBaseUrl) ? SKIPPED : checkService("GraphQL API", apiBaseUrl),
    checkService("Agents API", agentsServiceUrl()),
    setupTokenProblem(),
  ])
  const configProblems = [...staticConfigProblems(), ...(setupToken ? [setupToken] : [])]
  logChanges([...configProblems, ...[api.problem, agents.problem].filter((problem): problem is string => Boolean(problem))])

  const checks = { api: api.state, agents: agents.state, config: configProblems.length ? "misconfigured" : "ok" } as const
  return { status: Object.values(checks).every((check) => check === "ok" || check === "skipped") ? "ok" : "unavailable", checks }
}
