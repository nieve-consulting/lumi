import { Metadata } from "next"
import type { Dashboard, Query, QueryDashboardArgs } from "@/generated/graphql"
import { gql } from "@apollo/client"

import { getAdminClient } from "@/lib/adminApiClient"

import CrumbsSetter from "./components/Breadcrumbs/CrumbsSetter"
import ActivityChart from "./components/dashboard/ActivityChart"
import CostChart from "./components/dashboard/CostChart"
import KnowledgeBase from "./components/dashboard/KnowledgeBase"
import McpActivity from "./components/dashboard/McpActivity"
import RangeSelect, { parseRange } from "./components/dashboard/RangeSelect"
import RecentLeads from "./components/dashboard/RecentLeads"
import StatTiles from "./components/dashboard/StatTiles"
import UsageTable from "./components/dashboard/UsageTable"
import { getKnowledgeSources } from "./components/getKnowledgeSources"

export const metadata: Metadata = {
  title: "Dashboard | Admin",
}

interface IProps {
  searchParams: Promise<{ days?: string | string[] }>
}

async function getDashboard(days: number) {
  const client = await getAdminClient()

  const { data } = await client.query<Query, QueryDashboardArgs>({
    query: gql`
      query ($days: Int!) {
        dashboard(days: $days) {
          timeZone
          conversationsCost
          activity {
            date
            conversations
            leads
            meetings
            cost
            unpricedCalls
          }
          usage {
            purpose
            model
            adminCalls
            calls
            inputTokens
            cachedInputTokens
            outputTokens
            cost
          }
          recentLeads {
            id
            createdAt
            closed
            topic
            name
            email
            phone
          }
          content {
            teamMembers {
              total
              published
            }
            projects {
              total
              published
            }
            clients {
              total
              published
            }
            capabilities
            jobOpenings {
              total
              published
            }
          }
          websites {
            id
            name
            url
            pages
            lastProcessed
          }
          mcp {
            calls
            errors
            recent {
              id
              createdAt
              actorEmail
              tool
              recordType
              outcome
            }
          }
        }
      }
    `,
    variables: { days },
  })

  return data?.dashboard as Dashboard
}

export default async function AdminHome({ searchParams }: IProps) {
  const days = parseRange((await searchParams).days)
  // The tiles of structured sources that are off are hidden; all show when the sources couldn't be loaded
  const [dashboard, sources] = await Promise.all([getDashboard(days), getKnowledgeSources()])

  return (
    <>
      <CrumbsSetter crumbs={[{ label: "Dashboard" }]} />

      <h1 className="mb-6 text-2xl font-semibold">Dashboard</h1>
      <RangeSelect days={days} className="mb-6" />

      <div className="flex flex-col gap-4">
        <StatTiles activity={dashboard.activity} conversationsCost={dashboard.conversationsCost} usage={dashboard.usage} />
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
          <ActivityChart activity={dashboard.activity} timeZone={dashboard.timeZone} />
          <CostChart activity={dashboard.activity} timeZone={dashboard.timeZone} />
        </div>
        <RecentLeads leads={dashboard.recentLeads} timeZone={dashboard.timeZone} />
        <div className="grid grid-cols-1 gap-4 2xl:grid-cols-2">
          <UsageTable usage={dashboard.usage} />
          <McpActivity mcp={dashboard.mcp} timeZone={dashboard.timeZone} />
        </div>
        <KnowledgeBase content={dashboard.content} websites={dashboard.websites} sources={sources} />
      </div>
    </>
  )
}
