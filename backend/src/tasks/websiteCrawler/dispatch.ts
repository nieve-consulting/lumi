import type AwsDataSource from "@/apollo/sources/aws"
import { getApiKey } from "@/authorizers/apikey"

import type { CrawlEvent } from "./lambda/entry"

// How long the API waits for the worker to accept a crawl. It answers at once and crawls in the background
const WORKER_ACCEPT_TIMEOUT_MS = 10_000

// Starts the crawler without waiting for the crawl: the worker of the container installation when WEBSITE_CRAWLER_URL is set
// (src/container/worker.ts), else the crawler Lambda (WEBSITE_CRAWLER_FUNCTION_NAME), invoked asynchronously. Throws when the
// crawler couldn't be started, so the caller fails the queued crawl
export async function startWebsiteCrawler(event: CrawlEvent, aws: AwsDataSource) {
  const workerUrl = process.env.WEBSITE_CRAWLER_URL?.trim()
  if (!workerUrl) {
    return aws.invokeLambda(process.env.WEBSITE_CRAWLER_FUNCTION_NAME || "", { ...event })
  }

  let response: Response
  try {
    response = await fetch(`${workerUrl.replace(/\/+$/, "")}/crawls`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: await getApiKey() },
      body: JSON.stringify(event),
      signal: AbortSignal.timeout(WORKER_ACCEPT_TIMEOUT_MS),
    })
  } catch (error) {
    console.error(`The website crawler at ${workerUrl} couldn't be reached`, error)
    throw new Error("The website crawler couldn't be reached. Check that the worker is running.", { cause: error })
  }

  if (response.status !== 202) {
    console.error(`The website crawler refused the crawl: ${response.status} ${await response.text().catch(() => "")}`)
    throw new Error(`The website crawler refused the crawl (HTTP ${response.status}). Check the worker's logs.`)
  }
  return true
}
