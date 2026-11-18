import type { APIGatewayProxyEventV2 } from "aws-lambda"

// Who a GraphQL API (/graphql, /pdf) request comes from, by the key in its Authorization header (roles.ts resolves it):
// - internal: the installation's own key (LUMI_API_KEY), which the web app's server, the backend services and the worker
//   share. Everything, and the only one that may manage API keys and administrators
// - admin: a generated admin key. Everything but managing API keys and administrators
// - readOnly: a generated read-only key. Published records and public business data (src/apollo/access.ts)
// No database or SSM here, so the PDF Lambda can read the access without bundling either

export const API_ROLES = ["internal", "admin", "readOnly"] as const

export type ApiRole = (typeof API_ROLES)[number]

// The generated key's id for admin and readOnly, which its rate limit counts by (src/apollo/access.ts)
export type ApiAccess = { role: ApiRole; apiKeyId?: string }

// The access the HTTP API's authorizer (httpApi.ts) found for the request's key, from its context. A missing or unknown role,
// as from an authorizer that predates roles, is read-only: the least access
export function accessFromAuthorizerEvent(event: APIGatewayProxyEventV2): ApiAccess {
  const lambda = (event.requestContext as { authorizer?: { lambda?: { role?: unknown; apiKeyId?: unknown } } }).authorizer?.lambda
  const role = API_ROLES.find((known) => known === lambda?.role) ?? "readOnly"
  return typeof lambda?.apiKeyId === "string" ? { role, apiKeyId: lambda.apiKeyId } : { role }
}
