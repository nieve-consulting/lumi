import { Metadata } from "next"
import type { Capability, Query, TeamMember } from "@/generated/graphql"
import { Client } from "@/generated/graphql"
import { gql } from "@apollo/client"
import { inSentence } from "@lumi/shared-contracts/knowledge"

import { getAdminClient } from "@/lib/adminApiClient"

import CrumbsSetter from "../../components/Breadcrumbs/CrumbsSetter"
import { getSourceLabels } from "../../components/getKnowledgeSources"
import SourceOffNotice from "../../components/SourceOffNotice"
import ProjectForm from "../components/form/ProjectForm"

export async function generateMetadata(): Promise<Metadata> {
  return { title: `New ${inSentence((await getSourceLabels()).projects.singular)}` }
}

async function getClients() {
  const client = await getAdminClient()

  const { data } = await client.query<Query>({
    query: gql`
      query {
        clients(includeUnpublished: true) {
          id
          name
        }

        teamMembers(includeUnpublished: true) {
          id
          name
        }

        capabilities(includeUnpublished: true) {
          id
          name
        }
      }
    `,
  })

  return {
    clients: (data?.clients || []) as Client[],
    teamMembers: (data?.teamMembers || []) as TeamMember[],
    capabilities: (data?.capabilities || []) as Capability[],
  }
}

export default async function NewProjectPage() {
  const [{ clients, teamMembers, capabilities }, labels] = await Promise.all([getClients(), getSourceLabels()])
  const title = `New ${inSentence(labels.projects.singular)}`

  return (
    <>
      <CrumbsSetter crumbs={[{ label: "Dashboard", href: "/admin" }, { label: labels.projects.plural, href: "/admin/projects" }, { label: title }]} />
      <SourceOffNotice source="projects" />

      <h1 className="mb-5 border-b border-slate-200 text-2xl font-semibold">{title}</h1>
      <ProjectForm clients={clients} teamMembers={teamMembers} capabilities={capabilities} />
    </>
  )
}
