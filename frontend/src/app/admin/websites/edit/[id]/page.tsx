import { notFound } from "next/navigation"
import type { Query, QueryWebsiteArgs, Website } from "@/generated/graphql"
import { gql } from "@apollo/client"

import { getAdminClient } from "@/lib/adminApiClient"

import CrumbsSetter from "../../../components/Breadcrumbs/CrumbsSetter"
import { companyTimeZone } from "../../../components/dashboard/format"
import { isCrawling } from "../../components/crawl"
import { WEBSITE_CRAWL_FIELDS } from "../../components/crawlFields"
import WebsiteForm from "../../components/form/WebsiteForm"
import RefreshWhileCrawling from "../../components/RefreshWhileCrawling"
import CrawlStatus from "../../components/table/CrawlStatus"
import WebsiteMenu from "../../components/WebsiteMenu"

interface IProps {
  params: Promise<{ id: string }>
}

export async function generateMetadata({ params }: IProps) {
  const { id } = await params
  const { website } = await getWebsite(id)

  return { title: `Edit ${website?.name || "Website"}` }
}

async function getWebsite(id: string) {
  const client = await getAdminClient()

  const { data } = await client.query<Query, QueryWebsiteArgs>({
    query: gql`
      query ($id: ID!) {
        website(id: $id) {
          id
          name
          url
          sitemap
          description
          exclude_paths
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
    variables: { id },
  })

  return { website: data?.website as Website | undefined, timeZone: companyTimeZone(data?.calendar?.hostTimezone) }
}

export default async function EditWebsitePage({ params }: IProps) {
  const { id } = await params
  const { website, timeZone } = await getWebsite(id)

  if (!website) {
    return notFound()
  }

  return (
    <>
      <CrumbsSetter crumbs={[{ label: "Dashboard", href: "/admin" }, { label: "Websites", href: "/admin/websites" }, { label: website.name }]} />
      <div className="mb-10 flex items-center justify-between border-b border-slate-200 pb-3">
        <h1 className="text-2xl font-semibold">Edit {website.name}</h1>
        <div className="flex items-center gap-x-4">
          <CrawlStatus websiteId={id} crawl={website.latestCrawl} timeZone={timeZone} />
          <WebsiteMenu websiteId={id} crawl={website.latestCrawl} />
        </div>
      </div>

      <WebsiteForm website={website} />
      {/* Shows the crawl's progress, and enables the menu's crawl actions again once it ends */}
      <RefreshWhileCrawling crawling={isCrawling(website.latestCrawl)} />
    </>
  )
}
