import { Metadata } from "next"
import Link from "next/link"
import type { Client, Query } from "@/generated/graphql"
import { gql } from "@apollo/client"
import { inSentence } from "@lumi/shared-contracts/knowledge"
import { CirclePlus } from "lucide-react"

import { getAdminClient } from "@/lib/adminApiClient"
import { Button } from "@/components/ui/button"

import CrumbsSetter from "../components/Breadcrumbs/CrumbsSetter"
import { getSourceLabels } from "../components/getKnowledgeSources"
import SourceOffNotice from "../components/SourceOffNotice"
import { columns } from "./components/table/Columns"
import { DataTable } from "./components/table/DataTable"

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getSourceLabels()).clients.plural }
}

async function getClients() {
  const client = await getAdminClient()

  const { data } = await client.query<Query>({
    query: gql`
      query {
        clients(includeUnpublished: true) {
          id
          name
          summary
          description
          logo_key
          published
          translations {
            language
            outdated
            draft
          }
        }
      }
    `,
  })

  return (data?.clients || []) as Client[]
}

export default async function ClientsPage() {
  const [clients, labels] = await Promise.all([getClients(), getSourceLabels()])

  return (
    <>
      <CrumbsSetter crumbs={[{ label: "Dashboard", href: "/admin" }, { label: labels.clients.plural }]} />
      <SourceOffNotice source="clients" />

      <div className="mb-10 flex justify-between">
        <h1 className="text-2xl font-semibold">{labels.clients.plural}</h1>
        <Button asChild>
          <Link href="/admin/clients/new">
            <CirclePlus className="mr-2" />
            New {inSentence(labels.clients.singular)}
          </Link>
        </Button>
      </div>

      <DataTable columns={columns} data={clients} />
    </>
  )
}
