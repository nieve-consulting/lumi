import { Metadata } from "next"
import { inSentence } from "@lumi/shared-contracts/knowledge"

import CrumbsSetter from "../../components/Breadcrumbs/CrumbsSetter"
import { getSourceLabels } from "../../components/getKnowledgeSources"
import SourceOffNotice from "../../components/SourceOffNotice"
import ClientForm from "../components/form/ClientForm"

export async function generateMetadata(): Promise<Metadata> {
  return { title: `New ${inSentence((await getSourceLabels()).clients.singular)}` }
}

export default async function NewClientPage() {
  const labels = await getSourceLabels()
  const title = `New ${inSentence(labels.clients.singular)}`

  return (
    <>
      <CrumbsSetter crumbs={[{ label: "Dashboard", href: "/admin" }, { label: labels.clients.plural, href: "/admin/clients" }, { label: title }]} />
      <SourceOffNotice source="clients" />

      <h1 className="mb-5 border-b border-slate-200 text-2xl font-semibold">{title}</h1>
      <ClientForm />
    </>
  )
}
