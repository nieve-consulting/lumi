import { Metadata } from "next"
import { notFound } from "next/navigation"

import CrumbsSetter from "../components/Breadcrumbs/CrumbsSetter"
import { getAppintmentsData } from "./actions"
import AppointmentsForm from "./components/form/AppointmentsForm"

export const metadata: Metadata = { title: "Appointment Settings" }

export default async function AppointmentsPage() {
  const data = await getAppintmentsData()

  if (!data) {
    return notFound()
  }

  return (
    <>
      <CrumbsSetter crumbs={[{ label: "Dashboard", href: "/admin" }, { label: "Appointment Settings" }]} />

      <h1 className="mb-10 text-2xl font-semibold">Appointment Settings</h1>
      <AppointmentsForm data={data} />
    </>
  )
}
