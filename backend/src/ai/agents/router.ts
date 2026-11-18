import { isApiKey } from "@/authorizers/apikey"

import { corsHeaders, errorResponse } from "./http"
import { preSalesRoutes } from "./pre-sales/routes"
import type { AgentContext, AgentRoutes, Route, RouteParams } from "./types"

// Agent path segment -> routes
const agents: Record<string, AgentRoutes> = {
  "pre-sales": preSalesRoutes,
}

function matchPath(pattern: string, segments: string[]): RouteParams | undefined {
  const patternSegments = pattern.split("/").filter(Boolean)
  if (patternSegments.length !== segments.length) return undefined

  const params: RouteParams = {}
  for (const [idx, patternSegment] of patternSegments.entries()) {
    if (patternSegment.startsWith(":")) {
      params[patternSegment.slice(1)] = decodeURIComponent(segments[idx])
    } else if (patternSegment !== segments[idx]) {
      return undefined
    }
  }

  return params
}

function findRoute(routes: Route[], method: string, segments: string[]) {
  for (const route of routes) {
    const params = matchPath(route.path, segments)
    if (params && route.method === method) {
      return { route, params }
    }
  }
}

// The gateway authorizer already checks /admin in AWS; checking here as well covers the local server, the container and any
// misconfiguration
function isAdminAuthorized(request: Request) {
  return isApiKey(request.headers.get("authorization"))
}

async function dispatch(request: Request, context: AgentContext): Promise<Response> {
  // /agents/<agent>/... or /admin/<agent>/...
  const [scope, agent, ...segments] = new URL(request.url).pathname.split("/").filter(Boolean)
  const agentRoutes = agents[agent]

  if (!agentRoutes || (scope !== "agents" && scope !== "admin")) {
    return errorResponse(404, "Not found")
  }

  if (scope === "admin" && !(await isAdminAuthorized(request))) {
    return errorResponse(401, "Unauthorized")
  }

  const match = findRoute(scope === "admin" ? agentRoutes.admin : agentRoutes.public, request.method, segments)
  if (!match) {
    return errorResponse(404, "Not found")
  }

  return match.route.handler(request, context, match.params)
}

// Resolves the route and returns its response with the CORS headers. Errors thrown before a response exists become a 500
export async function route(request: Request, context: AgentContext): Promise<Response> {
  let response: Response
  try {
    response = await dispatch(request, context)
  } catch (error) {
    // The path only: the query may hold a threadId, which gives access to the conversation
    console.error("Error handling agents request", request.method, new URL(request.url).pathname, error)
    response = errorResponse(500, "An error occurred.")
  }

  for (const [name, value] of Object.entries(corsHeaders(request.headers.get("origin")))) {
    response.headers.set(name, value)
  }

  return response
}
