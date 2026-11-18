import "dotenv/config"

import http, { type IncomingMessage, type ServerResponse } from "node:http"
import { Writable } from "node:stream"
import type { APIGatewayProxyEvent, Context } from "aws-lambda"

import { preflightHeaders } from "../http"
import { installAwsLambdaShim, METADATA_EVENT, type ResponseMetadata } from "./awslambda-shim"

// Local stand-in for API Gateway + Lambda: builds a REST {proxy+} event and runs the same handler as the deployed function

process.env.NODE_ENV ||= "development"
process.env.AGENTS_ALLOWED_ORIGINS ||= "http://localhost:3000"

const port = parseInt(process.env.AGENTS_PORT || "4200")
const ROOT_RESOURCES = ["agents", "admin"]

async function readBody(req: IncomingMessage) {
  const chunks: Buffer[] = []
  for await (const chunk of req) {
    chunks.push(chunk as Buffer)
  }

  return Buffer.concat(chunks)
}

async function toProxyEvent(req: IncomingMessage, url: URL): Promise<APIGatewayProxyEvent> {
  const [root, ...proxy] = url.pathname.split("/").filter(Boolean)
  const body = await readBody(req)

  const headers: Record<string, string> = {}
  const multiValueHeaders: Record<string, string[]> = {}
  for (const [name, value] of Object.entries(req.headers)) {
    if (value === undefined) continue
    const values = Array.isArray(value) ? value : [value]
    headers[name] = values[values.length - 1]
    multiValueHeaders[name] = values
  }

  const queryStringParameters: Record<string, string> = {}
  const multiValueQueryStringParameters: Record<string, string[]> = {}
  for (const [name, value] of url.searchParams) {
    queryStringParameters[name] = value
    multiValueQueryStringParameters[name] = [...(multiValueQueryStringParameters[name] ?? []), value]
  }

  return {
    resource: `/${root}/{proxy+}`,
    path: url.pathname,
    httpMethod: req.method || "GET",
    headers,
    multiValueHeaders,
    queryStringParameters: url.search ? queryStringParameters : null,
    multiValueQueryStringParameters: url.search ? multiValueQueryStringParameters : null,
    pathParameters: { proxy: proxy.join("/") },
    stageVariables: null,
    // The caller's address, as API Gateway gives it, for the public routes' rate limits
    requestContext: { identity: { sourceIp: req.socket.remoteAddress ?? "" } } as APIGatewayProxyEvent["requestContext"],
    body: body.length > 0 ? body.toString("base64") : null,
    isBase64Encoded: body.length > 0,
  }
}

// Writable handed to the handler as the Lambda response stream
function createResponseStream(res: ServerResponse) {
  const responseStream = new Writable({
    write(chunk, _encoding, callback) {
      res.write(chunk, (error) => callback(error ?? null))
    },
    final(callback) {
      res.end(() => callback())
    },
  })

  responseStream.once(METADATA_EVENT, ({ statusCode = 200, headers = {} }: ResponseMetadata) => {
    res.writeHead(statusCode, headers)
  })

  // A cancelled turn aborts locally the way it does in Lambda: the next write fails
  res.on("close", () => {
    if (!res.writableFinished) {
      responseStream.destroy(new Error("Client disconnected"))
    }
  })

  return responseStream
}

;(async () => {
  installAwsLambdaShim()
  // The Lambda entry calls awslambda.streamifyResponse at the top level, so it is imported after the shim is installed
  const { handler } = await import("../lambda/agents")

  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`)
    const [root] = url.pathname.split("/").filter(Boolean)

    // Token writes must not be coalesced
    req.socket.setNoDelay(true)

    // API Gateway answers the CORS preflight in AWS
    if (req.method === "OPTIONS") {
      res.writeHead(204, preflightHeaders(req.headers.origin ?? null))
      res.end()
      return
    }

    if (!ROOT_RESOURCES.includes(root)) {
      res.writeHead(404, { "Content-Type": "application/json" })
      res.end(JSON.stringify({ error: "Not found" }))
      return
    }

    try {
      const event = await toProxyEvent(req, url)
      await handler(event, createResponseStream(res) as awslambda.HttpResponseStream, {} as Context)
    } catch (error) {
      console.error("Error handling local agents request", error)
      if (!res.headersSent) {
        res.writeHead(500, { "Content-Type": "application/json" })
      }
      res.end()
    }
  })

  server.listen(port, () => {
    console.log(`🚀  Agents server ready at: http://localhost:${port}/agents`)
  })
})()
