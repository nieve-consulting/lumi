import { Metadata } from "next"
import { inSentence } from "@lumi/shared-contracts/knowledge"

import CrumbsSetter from "../../components/Breadcrumbs/CrumbsSetter"
import { getSourceLabels } from "../../components/getKnowledgeSources"
import SourceOffNotice from "../../components/SourceOffNotice"
import JobOpeningForm from "../components/form/JobOpeningForm"

export async function generateMetadata(): Promise<Metadata> {
  return { title: `New ${inSentence((await getSourceLabels()).jobOpenings.singular)}` }
}

export default async function NewJobOpeningPage() {
  const labels = await getSourceLabels()
  const title = `New ${inSentence(labels.jobOpenings.singular)}`

  return (
    <>
      <CrumbsSetter
        crumbs={[{ label: "Dashboard", href: "/admin" }, { label: labels.jobOpenings.plural, href: "/admin/job-openings" }, { label: title }]}
      />
      <SourceOffNotice source="jobOpenings" />

      <h1 className="mb-5 border-b border-slate-200 text-2xl font-semibold">{title}</h1>
      <JobOpeningForm />
    </>
  )
}
