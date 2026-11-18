import { Metadata } from "next"
import Link from "next/link"
import type { JobOpening, Query } from "@/generated/graphql"
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
  return { title: (await getSourceLabels()).jobOpenings.plural }
}

// Every job opening, published or not, most recently posted first
async function getJobOpenings() {
  const client = await getAdminClient()

  const { data } = await client.query<Query>({
    query: gql`
      query {
        jobOpenings(includeUnpublished: true) {
          id
          title
          location
          work_mode
          posted_at
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

  return (data?.jobOpenings || []).filter((jobOpening): jobOpening is JobOpening => Boolean(jobOpening))
}

export default async function JobOpeningsPage() {
  const [jobOpenings, labels] = await Promise.all([getJobOpenings(), getSourceLabels()])

  return (
    <>
      <CrumbsSetter crumbs={[{ label: "Dashboard", href: "/admin" }, { label: labels.jobOpenings.plural }]} />
      <SourceOffNotice source="jobOpenings" />

      <div className="mb-10 flex justify-between">
        <h1 className="text-2xl font-semibold">{labels.jobOpenings.plural}</h1>
        <Button asChild>
          <Link href="/admin/job-openings/new">
            <CirclePlus className="mr-2" />
            New {inSentence(labels.jobOpenings.singular)}
          </Link>
        </Button>
      </div>

      <DataTable columns={columns} data={jobOpenings} />
    </>
  )
}
