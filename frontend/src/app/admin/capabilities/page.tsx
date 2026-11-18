import { Metadata } from "next"
import type { Capability, Query } from "@/generated/graphql"
import { gql } from "@apollo/client"

import { getAdminClient } from "@/lib/adminApiClient"

import CrumbsSetter from "../components/Breadcrumbs/CrumbsSetter"
import { getSourceLabels } from "../components/getKnowledgeSources"
import SourceOffNotice from "../components/SourceOffNotice"
import CreateButton from "./components/CreateButton"
import { DataTable } from "./components/table/DataTable"
import { CapabilityStoreProvider } from "./storeProvider"

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getSourceLabels()).capabilities.plural }
}

async function getCapabilities() {
  const client = await getAdminClient()

  const { data } = await client.query<Query>({
    query: gql`
      query {
        capabilities(includeUnpublished: true) {
          id
          name
          description
          translations {
            language
            name
            description
            updated_at
            outdated
            draft
          }
        }
      }
    `,
  })

  return (data?.capabilities || []) as Capability[]
}

export default async function CapabilitiesPage() {
  const [capabilities, labels] = await Promise.all([getCapabilities(), getSourceLabels()])

  return (
    <CapabilityStoreProvider>
      <CrumbsSetter crumbs={[{ label: "Dashboard", href: "/admin" }, { label: labels.capabilities.plural }]} />
      <SourceOffNotice source="capabilities" />

      <div className="mb-10 flex justify-between">
        <h1 className="text-2xl font-semibold">{labels.capabilities.plural}</h1>
        <CreateButton />
      </div>

      <DataTable data={capabilities} />
    </CapabilityStoreProvider>
  )
}
