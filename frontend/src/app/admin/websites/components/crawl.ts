import { WebsiteCrawlStatus, type WebsiteCrawl } from "@/generated/graphql"

// Whether the crawl is starting or running, so the website can't be crawled or cleared again and the page keeps refreshing.
// The API derives didn't start and interrupted for crawls that never report back, so these end too
export function isCrawling(crawl?: Pick<WebsiteCrawl, "status"> | null) {
  return crawl?.status === WebsiteCrawlStatus.Queued || crawl?.status === WebsiteCrawlStatus.Running
}
