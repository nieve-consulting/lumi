import { Metadata } from "next"

import CrumbsSetter from "../../components/Breadcrumbs/CrumbsSetter"
import WebsiteForm from "../components/form/WebsiteForm"

export const metadata: Metadata = {
  title: "New Website",
}

export default async function NewWebsitePage() {
  return (
    <>
      <CrumbsSetter crumbs={[{ label: "Dashboard", href: "/admin" }, { label: "Websites", href: "/admin/websites" }, { label: "New Website" }]} />

      <h1 className="mb-5 border-b border-slate-200 text-2xl font-semibold">New Website</h1>
      <WebsiteForm />
    </>
  )
}
