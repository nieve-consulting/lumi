import { lambdaDb } from "@/utils/db-setup"
import { GetParametersCommand, SSMClient } from "@aws-sdk/client-ssm"
import type { APIGatewayProxyEventV2, APIGatewayProxyStructuredResultV2 } from "aws-lambda"

import { SOURCE_IP_HEADER } from "../http"

// MCP server and its authorization server behind the HTTP API ($default stage, so the well-known documents are at the root).
// Responses are buffered: MCP runs stateless with JSON responses, and every tool call fits the gateway's 30 s limit

const { getDb, endRequest } = lambdaDb("lumi-mcp")

// The secrets are not in the function's environment, where the CloudFormation template would show them: MCP_SECRET_PARAMETERS
// maps each environment variable to the SecureString parameter holding it
async function loadSecrets() {
  const parameters: Record<string, string> = JSON.parse(process.env.MCP_SECRET_PARAMETERS || "{}")
  const names = Object.values(parameters)
  if (names.length === 0) return

  const { Parameters = [], InvalidParameters = [] } = await new SSMClient().send(new GetParametersCommand({ Names: names, WithDecryption: true }))
  if (InvalidParameters.length) throw new Error(`Missing SSM parameters: ${InvalidParameters.join(", ")}`)

  const values = new Map(Parameters.map(({ Name, Value }) => [Name, Value]))
  for (const [variable, name] of Object.entries(parameters)) process.env[variable] = values.get(name)
}

// The router is imported once the secrets are in the environment, since the configuration is read when its modules load. A
// failed load is forgotten, so the next request tries again; it starts during init, alongside the rest of the setup
let router: Promise<typeof import("../router")> | undefined
function getRouter() {
  router ??= loadSecrets()
    .then(() => import("../router"))
    .catch((error: unknown) => {
      router = undefined
      throw error
    })
  return router
}
void getRouter().catch((error: unknown) => console.warn("[MCP]: Could not load the configuration during init:", (error as Error).message))

function toRequest(event: APIGatewayProxyEventV2) {
  const headers = new Headers()
  for (const [name, value] of Object.entries(event.headers ?? {})) {
    if (value !== undefined) headers.set(name, value)
  }
  // HTTP API events carry the cookies apart from the headers
  if (event.cookies?.length) headers.set("cookie", event.cookies.join("; "))
  // The caller's address comes from the connection only, never from a client header
  headers.set(SOURCE_IP_HEADER, event.requestContext.http.sourceIp)

  const url = `https://${event.requestContext.domainName}${event.rawPath}${event.rawQueryString ? `?${event.rawQueryString}` : ""}`
  const method = event.requestContext.http.method
  const hasBody = event.body !== undefined && method !== "GET" && method !== "HEAD"

  return new Request(url, {
    method,
    headers,
    body: hasBody ? Buffer.from(event.body!, event.isBase64Encoded ? "base64" : "utf8") : undefined,
  })
}

async function toResult(response: Response): Promise<APIGatewayProxyStructuredResultV2> {
  const headers: Record<string, string> = {}
  response.headers.forEach((value, name) => {
    if (name !== "set-cookie") headers[name] = value
  })

  return { statusCode: response.status, headers, cookies: response.headers.getSetCookie(), body: await response.text(), isBase64Encoded: false }
}

export const handler = async (event: APIGatewayProxyEventV2): Promise<APIGatewayProxyStructuredResultV2> => {
  try {
    const [{ route }, db] = await Promise.all([getRouter(), getDb()])
    return await toResult(await route(db, toRequest(event)))
  } catch (error) {
    console.error("[MCP]: Error preparing request", error)
    return { statusCode: 500, headers: { "content-type": "application/json" }, body: JSON.stringify({ error: "An error occurred." }) }
  } finally {
    await endRequest()
  }
}
