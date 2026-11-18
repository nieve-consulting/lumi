import type { Metadata } from "next"
import type { Query, QueryClientArgs } from "@/generated/graphql"
import { Client } from "@/generated/graphql"
import { gql } from "@apollo/client"
import { z } from "zod"

import { getAdminClient } from "@/lib/adminApiClient"
import { LANGUAGE_PARAM, parseLanguage, type LanguageSearchParams } from "@/app/admin/components/translations/languages"

import CrumbsSetter from "../../../components/Breadcrumbs/CrumbsSetter"
import { getSourceLabels } from "../../../components/getKnowledgeSources"
import SourceOffNotice from "../../../components/SourceOffNotice"
import ClientForm from "../../components/form/ClientForm"

interface IProps {
  params: Promise<{ id: string }>
  // ?language= opens the form in that language, English by default
  searchParams: LanguageSearchParams
}

export async function generateMetadata({ params }: IProps): Promise<Metadata> {
  const { id } = await params
  const client = await getClient(id)

  return {
    title: `Edit ${client.name}`,
  }
}

async function getClient(id: string): Promise<Client> {
  const client = await getAdminClient()

  const { data } = await client.query<Query, QueryClientArgs>({
    query: gql`
      query ($id: ID!) {
        client(id: $id, includeUnpublished: true) {
          id
          name
          summary
          description
          logo_key
          url_slug
          internal_webpage
          client_website
          published
          translations {
            language
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

  return z.any().parse(data?.client)
}

export default async function editClientPage({ params, searchParams }: IProps) {
  const { id } = await params
  const language = parseLanguage((await searchParams)[LANGUAGE_PARAM])
  const [client, labels] = await Promise.all([getClient(id), getSourceLabels()])

  return (
    <>
      <CrumbsSetter
        crumbs={[{ label: "Dashboard", href: "/admin" }, { label: labels.clients.plural, href: "/admin/clients" }, { label: client.name }]}
      />
      <SourceOffNotice source="clients" />
      <h1 className="mb-5 border-b border-slate-200 text-2xl font-semibold">Edit {client.name}</h1>

      <ClientForm client={client} language={language} />
    </>
  )
}
