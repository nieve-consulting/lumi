import { cache } from "react"
import type { Metadata } from "next"
import type { JobOpening, Query, QueryJobOpeningArgs } from "@/generated/graphql"
import { gql } from "@apollo/client"
import { z } from "zod"

import { getAdminClient } from "@/lib/adminApiClient"
import { LANGUAGE_PARAM, parseLanguage, type LanguageSearchParams } from "@/app/admin/components/translations/languages"

import CrumbsSetter from "../../../components/Breadcrumbs/CrumbsSetter"
import { getSourceLabels } from "../../../components/getKnowledgeSources"
import SourceOffNotice from "../../../components/SourceOffNotice"
import JobOpeningForm from "../../components/form/JobOpeningForm"

interface IProps {
  params: Promise<{ id: string }>
  // ?language= opens the form in that language, English by default
  searchParams: LanguageSearchParams
}

export async function generateMetadata({ params }: IProps): Promise<Metadata> {
  const { id } = await params
  const jobOpening = await getJobOpening(id)

  return {
    title: `Edit ${jobOpening.title}`,
  }
}

// Once per request, as the page and its metadata both read it
const getJobOpening = cache(async (id: string): Promise<JobOpening> => {
  const client = await getAdminClient()

  const { data } = await client.query<Query, QueryJobOpeningArgs>({
    query: gql`
      query ($id: ID!) {
        jobOpening(id: $id, includeUnpublished: true) {
          id
          url_slug
          title
          summary
          description
          location
          work_mode
          application_url
          posted_at
          published
          translations {
            language
            title
            summary
            description
            updated_at
            outdated
            draft
          }
        }
      }
    `,
    variables: { id },
  })

  return z.any().parse(data?.jobOpening)
})

export default async function EditJobOpeningPage({ params, searchParams }: IProps) {
  const { id } = await params
  const language = parseLanguage((await searchParams)[LANGUAGE_PARAM])
  const [jobOpening, labels] = await Promise.all([getJobOpening(id), getSourceLabels()])

  return (
    <>
      <CrumbsSetter
        crumbs={[
          { label: "Dashboard", href: "/admin" },
          { label: labels.jobOpenings.plural, href: "/admin/job-openings" },
          { label: jobOpening.title },
        ]}
      />
      <SourceOffNotice source="jobOpenings" />
      <h1 className="mb-5 border-b border-slate-200 text-2xl font-semibold">Edit {jobOpening.title}</h1>

      <JobOpeningForm jobOpening={jobOpening} language={language} />
    </>
  )
}
