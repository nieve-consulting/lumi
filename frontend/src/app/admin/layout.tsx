import { Suspense } from "react"
import { Metadata } from "next"
import NextTopLoader from "nextjs-toploader"

import { requireAdminAccess } from "@/lib/auth/admin"
import { authConfig } from "@/lib/auth/config"
import { labelsOf } from "@/lib/knowledgeSources"
import { Toaster } from "@/components/ui/toaster"

import Breadcrumbs from "./components/Breadcrumbs/Breadcrumbs"
import { getKnowledgeSources } from "./components/getKnowledgeSources"
import LumiVersionInfo from "./components/Navigation/LumiVersionInfo"
import MobileMenu from "./components/Navigation/MobileMenu"
import SideMenu from "./components/Navigation/SideMenu"
import { SourceLabelsProvider } from "./components/SourceLabelsProvider"
import UserMenu from "./components/UserMenu"

interface LayoutProps {
  children: React.ReactNode
}

export const metadata: Metadata = { title: { template: "%s | Admin", default: "Admin" } }

export default async function Layout({ children }: LayoutProps) {
  // Pages, server actions and route handlers check admin access again: a layout is not rendered on every request
  const user = await requireAdminAccess()
  // Names the structured sources and hides those that are off. Saving them revalidates this layout
  const sources = await getKnowledgeSources()
  const switches = sources && {
    teamMembers: sources.teamMembers,
    projects: sources.projects,
    clients: sources.clients,
    capabilities: sources.capabilities,
    jobOpenings: sources.jobOpenings,
  }
  // Streams in after the navigation, which doesn't wait for it. Nothing shows while it loads or when it fails. The fallback
  // keeps the version line's height, so the Settings links above it don't move up when it arrives
  const version = (
    <Suspense fallback={<div aria-hidden className="h-4" />}>
      <LumiVersionInfo />
    </Suspense>
  )

  return (
    <SourceLabelsProvider labels={labelsOf(sources)} sources={switches}>
      <a
        href="#main"
        className="sr-only rounded-md bg-white text-sm font-medium text-slate-900 shadow-md focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50 focus:px-3 focus:py-2"
      >
        Skip to content
      </a>
      <SideMenu footer={version} />
      <div className="lg:ml-sidebar mb-5 px-4">
        <div className="flex gap-2 py-2">
          <MobileMenu footer={version} />
          <div className="content-center">
            <Breadcrumbs />
          </div>
          <div className="grow" />
          <div>
            <UserMenu email={user.email} name={user.name} image={user.image} canChangePassword={authConfig.mode === "local"} />
          </div>
        </div>
        <main id="main" tabIndex={-1} className="mt-2 rounded bg-white p-4 outline-none">
          {children}
        </main>
      </div>
      <Toaster />
      <NextTopLoader shadow={false} height={5} color="#2563eb" showSpinner={false} />
    </SourceLabelsProvider>
  )
}
