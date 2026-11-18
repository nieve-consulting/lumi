import { lambdaDb } from "@/utils/db-setup"
import type { APIGatewayRequestAuthorizerEventV2, APIGatewaySimpleAuthorizerResult, APIGatewaySimpleAuthorizerWithContextResult } from "aws-lambda"

import type { ApiAccess } from "./apiAccess"
import { resolveApiAccess } from "./roles"

// The HTTP API's authorizer (/graphql, /pdf): authorizes the installation's own key and active generated keys, and
// passes the key's access on in its context, which the Apollo and PDF Lambdas read (accessFromAuthorizerEvent in apiAccess.ts)
// and enforce (src/apollo/access.ts, src/pdfGenerator/lambda/entry.ts). The gateway caches the answer per key for five
// minutes, so a revoked key is refused within five minutes.
// A lookup that fails throws, which the gateway answers with 500 without caching.
// Every warm instance keeps its own connection on the small database, so it keeps one: its queries run one after the other.
// It connects on the first generated key it sees, not at init, as most requests carry the installation's own key, which needs
// no database. Connecting and each query give up well within the authorizer's 10 s timeout
const { getDb, endRequest } = lambdaDb("lumi-api-authorizer", {
  poolOptions: { max: 1, connectionTimeoutMillis: 4_000, query_timeout: 4_000 },
  connectAtInit: false,
})

export const handler = async (
  event: APIGatewayRequestAuthorizerEventV2
): Promise<APIGatewaySimpleAuthorizerResult | APIGatewaySimpleAuthorizerWithContextResult<ApiAccess>> => {
  try {
    // resolveApiAccess only sets apiKeyId for a generated key, so the context never carries an undefined value
    const access = await resolveApiAccess(event.identitySource?.[0], getDb)
    if (!access) return { isAuthorized: false }

    return { isAuthorized: true, context: access }
  } finally {
    await endRequest()
  }
}
