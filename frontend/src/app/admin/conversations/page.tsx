import { Metadata } from "next"
import type { Query, Thread } from "@/generated/graphql"
import { gql } from "@apollo/client"

import { getAdminClient } from "@/lib/adminApiClient"

import CrumbsSetter from "../components/Breadcrumbs/CrumbsSetter"
import { companyTimeZone } from "../components/dashboard/format"
import { DataTable } from "./components/table/DataTable"

export const metadata: Metadata = { title: "Conversations" }

async function getConversations() {
  const client = await getAdminClient()

  const { data } = await client.query<Query>({
    query: gql`
      query {
        threads {
          id
          closed
          topic
          createdAt
          email
          name
          phone
          cost
          enquiryFailed
        }
        calendar {
          hostTimezone
        }
      }
    `,
  })

  return { chats: (data?.threads || []) as Thread[], timeZone: companyTimeZone(data?.calendar?.hostTimezone) }
}

export default async function Page() {
  const { chats, timeZone } = await getConversations()

  return (
    <>
      <CrumbsSetter crumbs={[{ label: "Dashboard", href: "/admin" }, { label: "Conversations" }]} />
      <div className="mb-10">
        <h1 className="text-2xl font-semibold">Conversations</h1>
      </div>

      <DataTable data={chats.map((chat) => ({ ...chat }))} timeZone={timeZone} />
    </>
  )
}
