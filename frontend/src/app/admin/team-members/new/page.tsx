import { Metadata } from "next"
import type { Query } from "@/generated/graphql"
import { Capability } from "@/generated/graphql"
import { gql } from "@apollo/client"
import { inSentence } from "@lumi/shared-contracts/knowledge"

import { getAdminClient } from "@/lib/adminApiClient"

import CrumbsSetter from "../../components/Breadcrumbs/CrumbsSetter"
import { getSourceLabels } from "../../components/getKnowledgeSources"
import SourceOffNotice from "../../components/SourceOffNotice"
import TeamMemberForm from "../components/form/TeamMemberForm"

export async function generateMetadata(): Promise<Metadata> {
  return { title: `New ${inSentence((await getSourceLabels()).teamMembers.singular)}` }
}

async function getCapabilities() {
  const client = await getAdminClient()

  const { data } = await client.query<Query>({
    query: gql`
      query {
        capabilities(includeUnpublished: true) {
          id
          name
        }
      }
    `,
  })

  return (data?.capabilities || []) as Capability[]
}

export default async function NewTeamMemberPage() {
  const [capabilities, labels] = await Promise.all([getCapabilities(), getSourceLabels()])
  const title = `New ${inSentence(labels.teamMembers.singular)}`

  return (
    <>
      <CrumbsSetter
        crumbs={[{ label: "Dashboard", href: "/admin" }, { label: labels.teamMembers.plural, href: "/admin/team-members" }, { label: title }]}
      />
      <SourceOffNotice source="teamMembers" />

      <h1 className="mb-5 border-b border-slate-200 text-2xl font-semibold">{title}</h1>
      <TeamMemberForm capabilities={capabilities} />
    </>
  )
}
