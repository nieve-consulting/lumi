import { flushTraces } from "@/ai/tracing"
import AwsDataSource from "@/apollo/sources/aws"
import DbDataSource from "@/apollo/sources/dbDataSource"
import GCalendarSource from "@/apollo/sources/gCalendar"
import EmbeddingSource from "@/apollo/sources/vectorStore"
import { lambdaDb } from "@/utils/db-setup"
import type { APIGatewayProxyEvent } from "aws-lambda"

import { abortOnClientDisconnect, errorResponse, toWebRequest, writeResponse } from "../http"
import { route } from "../router"

const { getDb, endRequest } = lambdaDb("lumi-agents")

export const handler = awslambda.streamifyResponse<APIGatewayProxyEvent>(async (event, responseStream) => {
  const controller = new AbortController()
  abortOnClientDisconnect(responseStream, controller)

  try {
    let response: Response
    try {
      const db = await getDb()
      const request = toWebRequest(event, controller.signal)

      response = await route(request, {
        db: new DbDataSource(db),
        drizzle: db,
        pool: db.$client,
        embeddings: new EmbeddingSource(db.$client),
        gCalendar: new GCalendarSource(),
        aws: new AwsDataSource(),
        signal: controller.signal,
      })
    } catch (error) {
      console.error("Error preparing agents request", error)
      response = errorResponse(500, "An error occurred.")
    }

    await writeResponse(response, responseStream, controller)
  } finally {
    await Promise.all([flushTraces(), endRequest()])
  }
})
