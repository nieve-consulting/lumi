import { consumeApiKeyLimit } from "@/apollo/apiKeyLimit"
import server from "@/apollo/server"
import { accessFromAuthorizerEvent } from "@/authorizers/apiAccess"
import { lambdaDb } from "@/utils/db-setup"
import { handlers, startServerAndCreateLambdaHandler } from "@as-integrations/aws-lambda"

import AwsDataSource from "../sources/aws"
import DbDataSource from "../sources/dbDataSource"
import GCalendarSource from "../sources/gCalendar"
import S3Source from "../sources/s3Source"
import EmbeddingSource from "../sources/vectorStore"

const { getDb, endRequest } = lambdaDb("lumi-api")

const apolloHandler = startServerAndCreateLambdaHandler(server, handlers.createAPIGatewayProxyEventV2RequestHandler(), {
  context: async ({ event }) => {
    const db = await getDb()

    return {
      // The role the HTTP API's authorizer (src/authorizers/httpApi.ts) found for the request's key
      ...accessFromAuthorizerEvent(event),
      drizzle: db,
      dataSources: {
        db: new DbDataSource(db),
        s3: new S3Source(),
        embeddings: new EmbeddingSource(db.$client),
        gCalendar: new GCalendarSource(),
        aws: new AwsDataSource(),
      },
    }
  },
})

// Counts a generated key's request against its rate limit before Apollo sees it, so even one that doesn't parse counts
// (../apiKeyLimit.ts). Gives back the extra database connections once the response is ready, before the Lambda freezes
export async function graphqlHandler(...args: Parameters<typeof apolloHandler>) {
  try {
    const refusal = await consumeApiKeyLimit(accessFromAuthorizerEvent(args[0]), getDb)
    if (refusal) return { statusCode: refusal.status, headers: refusal.headers, body: refusal.body }
    return await apolloHandler(...args)
  } finally {
    await endRequest()
  }
}
