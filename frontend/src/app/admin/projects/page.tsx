import { Metadata } from "next"
import Link from "next/link"
import type { Project, Query } from "@/generated/graphql"
import { gql } from "@apollo/client"
import { inSentence } from "@lumi/shared-contracts/knowledge"
import { CirclePlus } from "lucide-react"

import { getAdminClient } from "@/lib/adminApiClient"
import { Button } from "@/components/ui/button"

import CrumbsSetter from "../components/Breadcrumbs/CrumbsSetter"
import { getSourceLabels } from "../components/getKnowledgeSources"
import SourceOffNotice from "../components/SourceOffNotice"
import { DataTable } from "./components/table/DataTable"

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getSourceLabels()).projects.plural }
}

async function getProjects() {
  const client = await getAdminClient()

  const { data } = await client.query<Query>({
    query: gql`
      query {
        projects(includeUnpublished: true) {
          id
          name
          image_key
          start_date
          end_date
          summary
          description
          published
          translations {
            language
            outdated
            draft
          }
          teamMembers(includeUnpublished: true) {
            description
            translations {
              language
              outdated
              draft
            }
          }

          client(includeUnpublished: true) {
            name
          }
        }
      }
    `,
  })

  return (data?.projects || []) as Project[]
}

export default async function ProjectsPage() {
  const [projects, labels] = await Promise.all([
    getProjects().then((projects) => projects.map((project) => ({ ...project, clientName: project?.client?.name }))),
    getSourceLabels(),
  ])

  return (
    <>
      <CrumbsSetter crumbs={[{ label: "Dashboard", href: "/admin" }, { label: labels.projects.plural }]} />
      <SourceOffNotice source="projects" />

      <div className="mb-10 flex justify-between">
        <h1 className="text-2xl font-semibold">{labels.projects.plural}</h1>
        <Button asChild>
          <Link href="/admin/projects/new">
            <CirclePlus className="mr-2" />
            New {inSentence(labels.projects.singular)}
          </Link>
        </Button>
      </div>

      <DataTable data={projects} />
    </>
  )
}
