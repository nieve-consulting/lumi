import type { IncomingMessage, ServerResponse } from "node:http"
import { consumeApiKeyLimit } from "@/apollo/apiKeyLimit"
import server from "@/apollo/server"
import AwsDataSource from "@/apollo/sources/aws"
import DbDataSource from "@/apollo/sources/dbDataSource"
import GCalendarSource from "@/apollo/sources/gCalendar"
import S3Source, { describeStorageProblem, isMediaStorageConfigured } from "@/apollo/sources/s3Source"
import EmbeddingSource from "@/apollo/sources/vectorStore"
import type { ApiAccess } from "@/authorizers/apiAccess"
import { createPdfHandler } from "@/pdfGenerator/http"
import { createDb } from "@/utils/db-setup"
import { HeaderMap } from "@apollo/server"

import { DEFAULT_CHROMIUM_PATH, servicePort, usesBundledStorage } from "./config"
import { createHealthCheck } from "./health"
import {
  apiAccess,
  createAddressRateLimit,
  handleShutdown,
  isProxied,
  pathOf,
  readBody,
  sendHealth,
  sendJson,
  SERVICE_POOL_OPTIONS,
  sourceIp,
  startServer,
  webHeaders,
} from "./server"

// The container's GraphQL API, in place of the API Gateway HTTP API with its authorizer, the Apollo Lambda and the PDF Lambda:
// - POST /graphql: the Apollo schema
// - POST /pdf: { document, filename, pdfOptions? } rendered to a PDF with the image's Chromium (src/pdfGenerator/http.ts)
// - GET /health: unauthenticated (health.ts)
// /graphql and /pdf need an API key in the Authorization header, as the gateway's authorizer (src/authorizers/httpApi.ts)
// requires in AWS: the installation's own key, only from the private network (the web app's server), or an active key an admin
// generated. The key's role goes into the GraphQL context, where src/apollo/access.ts enforces it, along with each generated
// key's own rate limit. Requests from outside are first counted by address (PROXIED_REQUESTS_PER_MINUTE)

// Requests from outside (through the proxy) each address may make to /graphql and /pdf per minute, counted before their key
// is looked up, so a flood of made-up keys can't turn into as many database queries. As much as a generated key may make
// (src/apollo/access.ts), so a website build behind one address isn't limited before its key is
const PROXIED_REQUESTS_PER_MINUTE = 3000

export async function startApi() {
  const db = await createDb("lumi-api", SERVICE_POOL_OPTIONS)
  const checkHealth = createHealthCheck("lumi-api")
  const pdf = createPdfHandler(() => process.env.PUPPETEER_EXECUTABLE_PATH?.trim() || DEFAULT_CHROMIUM_PATH)
  const proxiedRateLimit = createAddressRateLimit(PROXIED_REQUESTS_PER_MINUTE, 60)

  await server.start()

  async function graphql(req: IncomingMessage, res: ServerResponse, access: ApiAccess) {
    // Before Apollo sees the request, so even one that doesn't parse counts (src/apollo/apiKeyLimit.ts)
    const refusal = await consumeApiKeyLimit(access, async () => db)
    if (refusal) {
      res.writeHead(refusal.status, refusal.headers)
      res.end(refusal.body)
      return
    }

    const headers = new HeaderMap(webHeaders(req))

    let body: unknown
    const raw = await readBody(req)
    if (raw.length > 0 && headers.get("content-type")?.includes("json")) {
      try {
        body = JSON.parse(raw.toString("utf8"))
      } catch {
        sendJson(res, 400, { errors: [{ message: "The request body is not valid JSON" }] })
        return
      }
    }

    const response = await server.executeHTTPGraphQLRequest({
      httpGraphQLRequest: { method: (req.method || "GET").toUpperCase(), headers, search: new URL(req.url || "/", "http://localhost").search, body },
      context: async () => ({
        ...access,
        drizzle: db,
        dataSources: {
          db: new DbDataSource(db),
          s3: new S3Source(),
          embeddings: new EmbeddingSource(db.$client),
          gCalendar: new GCalendarSource(),
          aws: new AwsDataSource(),
        },
      }),
    })

    for (const [name, value] of response.headers) {
      res.setHeader(name, value)
    }
    res.statusCode = response.status || 200

    if (response.body.kind === "complete") {
      res.end(response.body.string)
      return
    }
    for await (const chunk of response.body.asyncIterator) {
      res.write(chunk)
    }
    res.end()
  }

  const httpServer = startServer("api", servicePort("api"), async (req, res) => {
    const path = pathOf(req)

    if (path === "/health" && req.method === "GET") {
      await sendHealth(res, checkHealth)
      return
    }
    if (path !== "/graphql" && path !== "/pdf") {
      sendJson(res, 404, { error: "Not found" })
      return
    }
    if (isProxied(req)) {
      const limit = proxiedRateLimit(sourceIp(req))
      if (!limit.allowed) {
        sendJson(res, 429, { message: "Too many requests. Wait a minute and try again." }, { "Retry-After": String(limit.retryAfterSeconds) })
        return
      }
    }
    const access = await apiAccess(req, async () => db)
    if (!access) {
      sendJson(res, 401, { message: "Unauthorized" })
      return
    }

    // Every role may render PDFs. Only the installation's own key's documents run scripts (RenderOptions in src/pdfGenerator/render.ts)
    await (path === "/graphql" ? graphql(req, res, access) : pdf(req, res, { scripts: access.role === "internal" }))
  })

  // Said once at start rather than only when an admin's upload fails. The service starts all the same: only images need it.
  // A bundled storage that isn't set up was reported by the configuration check (config.ts)
  if (isMediaStorageConfigured()) {
    describeStorageProblem({ bundled: usesBundledStorage() })
      .then((problem) => {
        if (problem) console.warn(`Warning: media storage isn't working, so images can't be uploaded or shown: ${problem}`)
      })
      .catch((error: unknown) => console.warn("Warning: media storage couldn't be checked:", error))
  }

  handleShutdown("api", httpServer, async () => {
    await server.stop()
    await db.$client.end()
  })
}
