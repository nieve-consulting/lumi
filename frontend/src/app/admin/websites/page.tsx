import { Metadata } from "next"
import Link from "next/link"
import type { Query, Website } from "@/generated/graphql"
import { gql } from "@apollo/client"
import { CirclePlus } from "lucide-react"

import { getAdminClient } from "@/lib/adminApiClient"
import { Button } from "@/components/ui/button"

import CrumbsSetter from "../components/Breadcrumbs/CrumbsSetter"
import { companyTimeZone } from "../components/dashboard/format"
import { isCrawling } from "./components/crawl"
import { WEBSITE_CRAWL_FIELDS } from "./components/crawlFields"
import RefreshWhileCrawling from "./components/RefreshWhileCrawling"
import { DataTable } from "./components/table/DataTable"

export const metadata: Metadata = {
  title: "Websites",
}

async function getWebsites() {
  const client = await getAdminClient()

  const { data } = await client.query<Query>({
    query: gql`
      query {
        websites {
          id
          name
          url
          last_processed
          latestCrawl {
            ...WebsiteCrawlFields
          }
        }
        calendar {
          hostTimezone
        }
      }
      ${WEBSITE_CRAWL_FIELDS}
    `,
  })

  return { websites: (data?.websites || []) as Website[], timeZone: companyTimeZone(data?.calendar?.hostTimezone) }
}

export default async function WebsitesPage() {
  const { websites, timeZone } = await getWebsites()

  return (
    <>
      <CrumbsSetter crumbs={[{ label: "Dashboard", href: "/admin" }, { label: "Websites" }]} />

      <div className="mb-10 flex justify-between">
        <h1 className="text-2xl font-semibold">Websites</h1>
        <Button asChild>
          <Link href="/admin/websites/new">
            <CirclePlus className="mr-2" />
            Add website
          </Link>
        </Button>
      </div>

      <DataTable data={websites} timeZone={timeZone} />
      <RefreshWhileCrawling crawling={websites.some((website) => isCrawling(website.latestCrawl))} />
    </>
  )
}
