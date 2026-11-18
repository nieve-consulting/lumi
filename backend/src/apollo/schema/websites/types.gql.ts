export const websitesTypeDefs = /* GraphQL */ `
  scalar JSON

  type Website {
    id: ID!
    created_at: String!
    updated_at: String!
    last_processed: String
    name: String!
    sitemap: String!
    description: String
    url: String
    exclude_paths: [String]
    "The website's most recent crawl, or none if it was never crawled since crawls were tracked"
    latestCrawl: WebsiteCrawl
  }

  "Update Pages crawls new and modified pages; Re-process crawls them all after clearing them"
  enum WebsiteCrawlKind {
    UPDATE
    REPROCESS
  }

  enum WebsiteCrawlStatus {
    "Requested, and the crawler hasn't picked it up yet"
    QUEUED
    RUNNING
    COMPLETED
    "Ran out of time before the Lambda timeout. Update Pages continues it"
    STOPPED
    FAILED
    "Requested five minutes ago or more, and the crawler never picked it up"
    NOT_STARTED
    "Was running and ended without reporting how, for example when its Lambda was killed"
    INTERRUPTED
  }

  type WebsiteCrawl {
    id: ID!
    kind: WebsiteCrawlKind!
    status: WebsiteCrawlStatus!
    "Sitemap pages to check, after exclusions. Unknown until the sitemap is read"
    pagesTotal: Int
    "Sitemap pages checked so far, modified or not"
    pagesChecked: Int!
    "Pages crawled again because they were new or modified"
    pagesProcessed: Int!
    "Pages removed with their search content: no longer in the sitemap, now excluded, gone (401, 403, 404 or 410) or not indexable"
    pagesRemoved: Int!
    "Sitemap pages left out because the crawl reached its page limit"
    pagesOverLimit: Int!
    "Why the crawl failed"
    error: String
    createdAt: String!
    startedAt: String
    finishedAt: String
  }

  type Document {
    pageContent: String!
    metadata: JSON!
  }

  type WebsitePageResult {
    url: String!
    title: String!
    documents: [Document]
  }

  input WebsiteInput {
    name: String!
    sitemap: String!
    url: String!
    description: String
    exclude_paths: [String]
  }

  type Query {
    websites: [Website]
    website(id: ID!): Website
    searchWebsitePages(query: String!): [WebsitePageResult]
  }

  type Mutation {
    "The URL must be a public http(s) address: private, local and reserved network addresses are refused (BAD_USER_INPUT)"
    createWebsite(input: WebsiteInput!): ID
    updateWebsite(id: ID!, input: WebsiteInput!): Boolean
    deleteWebsite(id: ID!): Boolean
    "Deletes the website's pages and their search content. Fails while the website is being crawled"
    clearProcessedWebsitePages(id: ID!): Boolean
    "Starts crawling the website for new and modified pages. Fails while the website is being crawled or a crawl is starting"
    updateWebsitePages(
      id: ID!
      "Email of the admin who started the crawl, whose own calls record its model usage. Without it, the usage is only logged"
      adminEmail: String
      "REPROCESS labels the crawl Re-process, once the pages were cleared"
      kind: WebsiteCrawlKind = UPDATE
    ): Boolean
  }
`
