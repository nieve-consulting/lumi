import { notFound } from "next/navigation"
import type { Capability, Query, QueryTeamMemberArgs, TeamMember } from "@/generated/graphql"
import { gql } from "@apollo/client"
import { inSentence } from "@lumi/shared-contracts/knowledge"

import { getAdminClient } from "@/lib/adminApiClient"
import { LANGUAGE_PARAM, parseLanguage, type LanguageSearchParams } from "@/app/admin/components/translations/languages"

import CrumbsSetter from "../../../components/Breadcrumbs/CrumbsSetter"
import { getSourceLabels } from "../../../components/getKnowledgeSources"
import SourceOffNotice from "../../../components/SourceOffNotice"
import TeamMemberForm from "../../components/form/TeamMemberForm"

interface IProps {
  params: Promise<{ id: string }>
  // ?language= opens the form in that language, English by default
  searchParams: LanguageSearchParams
}

export async function generateMetadata({ params }: IProps) {
  const { id } = await params
  const [{ teamMember }, labels] = await Promise.all([getTeamMember(id), getSourceLabels()])

  return {
    title: `Edit ${teamMember?.name || inSentence(labels.teamMembers.singular)}`,
  }
}

async function getTeamMember(id: string) {
  const client = await getAdminClient()

  const { data } = await client.query<Query, QueryTeamMemberArgs>({
    query: gql`
      query ($id: ID!) {
        teamMember(id: $id, includeUnpublished: true) {
          id
          name
          published
          bio
          webpage
          job_title
          url_slug
          education
          capability_highlights
          profile_photo_key
          translations {
            language
            job_title
            capability_highlights
            bio
            education
            updated_at
            outdated
            draft
          }
          experiences {
            id
            company
            location
            position
            start_date
            end_date
            description
            logo_key
            translations {
              language
              position
              description
              updated_at
              outdated
              draft
            }
          }
          capabilities {
            id
            name
            stars
          }
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
    teamMember: data?.teamMember as TeamMember | undefined,
    capabilities: (data?.capabilities || []) as Capability[],
  }
}

export default async function editTeamMemberPage({ params, searchParams }: IProps) {
  const { id } = await params
  const language = parseLanguage((await searchParams)[LANGUAGE_PARAM])
  const [{ teamMember, capabilities }, labels] = await Promise.all([getTeamMember(id), getSourceLabels()])

  if (!teamMember) {
    return notFound()
  }

  return (
    <>
      <CrumbsSetter
        crumbs={[
          { label: "Dashboard", href: "/admin" },
          { label: labels.teamMembers.plural, href: "/admin/team-members" },
          { label: teamMember.name },
        ]}
      />
      <SourceOffNotice source="teamMembers" />
      <h1 className="mb-5 border-b border-slate-200 text-2xl font-semibold">Edit {teamMember.name}</h1>

      <TeamMemberForm teamMember={teamMember} language={language} capabilities={capabilities} />
    </>
  )
}
