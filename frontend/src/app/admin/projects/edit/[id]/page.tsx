import { notFound } from "next/navigation"
import type { Capability, Client, Project, Query, QueryProjectArgs, TeamMember } from "@/generated/graphql"
import { gql } from "@apollo/client"
import { inSentence } from "@lumi/shared-contracts/knowledge"

import { getAdminClient } from "@/lib/adminApiClient"
import { LANGUAGE_PARAM, parseLanguage, type LanguageSearchParams } from "@/app/admin/components/translations/languages"

import CrumbsSetter from "../../../components/Breadcrumbs/CrumbsSetter"
import { getSourceLabels } from "../../../components/getKnowledgeSources"
import SourceOffNotice from "../../../components/SourceOffNotice"
import ProjectForm from "../../components/form/ProjectForm"

interface IProps {
  params: Promise<{ id: string }>
  // ?language= opens the form in that language, English by default
  searchParams: LanguageSearchParams
}

export async function generateMetadata({ params }: IProps) {
  const { id } = await params
  const [{ project }, labels] = await Promise.all([getProject(id), getSourceLabels()])

  return {
    title: `Edit ${project?.name || inSentence(labels.projects.singular)}`,
  }
}

async function getProject(id: string) {
  const client = await getAdminClient()

  const { data } = await client.query<Query, QueryProjectArgs>({
    query: gql`
      query ($id: ID!) {
        project(id: $id, includeUnpublished: true) {
          id
          name
          webpage
          start_date
          end_date
          location
          summary
          description
          url_slug
          industry
          type
          image_key
          published
          translations {
            language
            name
            summary
            description
            industry
            type
            updated_at
            outdated
            draft
          }

          client(includeUnpublished: true) {
            id
          }
          teamMembers(includeUnpublished: true) {
            teamMember {
              id
              name
            }
            description
            start_date
            end_date
            translations {
              language
              description
              updated_at
              outdated
              draft
            }
          }
          capabilities {
            id
            name
          }
        }

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
    variables: { id },
  })

  return {
    project: data?.project as Project | undefined,
    clients: (data?.clients || []) as Client[],
    teamMembers: (data?.teamMembers || []) as TeamMember[],
    capabilities: (data?.capabilities || []) as Capability[],
  }
}

export default async function editProjectPage({ params, searchParams }: IProps) {
  const { id } = await params
  const language = parseLanguage((await searchParams)[LANGUAGE_PARAM])
  const [{ project, clients, teamMembers, capabilities }, labels] = await Promise.all([getProject(id), getSourceLabels()])

  if (!project) {
    return notFound()
  }

  return (
    <>
      <CrumbsSetter
        crumbs={[{ label: "Dashboard", href: "/admin" }, { label: labels.projects.plural, href: "/admin/projects" }, { label: project.name }]}
      />
      <SourceOffNotice source="projects" />
      <h1 className="mb-5 border-b border-slate-200 text-2xl font-semibold">Edit {project.name}</h1>

      <ProjectForm project={project} language={language} clients={clients} teamMembers={teamMembers} capabilities={capabilities} />
    </>
  )
}
