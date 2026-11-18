import { Metadata } from "next"
import Link from "next/link"
import type { Query, TeamMember } from "@/generated/graphql"
import { gql } from "@apollo/client"
import { inSentence } from "@lumi/shared-contracts/knowledge"
import { CirclePlus } from "lucide-react"

import { getAdminClient } from "@/lib/adminApiClient"
import { offersResumes } from "@/lib/resume"
import { Button } from "@/components/ui/button"

import CrumbsSetter from "../components/Breadcrumbs/CrumbsSetter"
import { getSourceLabels } from "../components/getKnowledgeSources"
import SourceOffNotice from "../components/SourceOffNotice"
import { columns } from "./components/table/Columns"
import { DataTable } from "./components/table/DataTable"

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getSourceLabels()).teamMembers.plural }
}

async function getTeamMembers() {
  const client = await getAdminClient()

  const { data } = await client.query<Query>({
    query: gql`
      query {
        teamMembers(includeUnpublished: true) {
          id
          name
          job_title
          profile_photo_key
          published
          translations {
            language
            outdated
            draft
          }
          experiences {
            translations {
              language
              outdated
              draft
            }
          }
        }
      }
    `,
  })

  return (data?.teamMembers || []) as TeamMember[]
}

export default async function TeamMembersPage() {
  const [teamMembers, labels, resumes] = await Promise.all([getTeamMembers(), getSourceLabels(), offersResumes()])

  return (
    <>
      <CrumbsSetter crumbs={[{ label: "Dashboard", href: "/admin" }, { label: labels.teamMembers.plural }]} />
      <SourceOffNotice source="teamMembers" />

      <div className="mb-10 flex justify-between">
        <h1 className="text-2xl font-semibold">{labels.teamMembers.plural}</h1>
        <Button asChild>
          <Link href="/admin/team-members/new">
            <CirclePlus className="mr-2" />
            New {inSentence(labels.teamMembers.singular)}
          </Link>
        </Button>
      </div>

      <DataTable columns={columns} data={teamMembers} resumes={resumes} />
    </>
  )
}
