import { gql } from "@apollo/client"

// The fields of a website's latest crawl that its status shows, read by the websites page and the website's page
export const WEBSITE_CRAWL_FIELDS = gql`
  fragment WebsiteCrawlFields on WebsiteCrawl {
    id
    kind
    status
    pagesTotal
    pagesChecked
    pagesProcessed
    pagesRemoved
    pagesOverLimit
    error
    finishedAt
  }
`
