import { Metadata } from "next"
import Link from "next/link"
import type { Query } from "@/generated/graphql"
import { gql } from "@apollo/client"
import { contactHref } from "@lumi/shared-contracts/business"
import { BookOpen, CalendarClock, FileText, IdCard, KeyRound, Library, UserCog } from "lucide-react"

import { getAdminClient } from "@/lib/adminApiClient"
import { requireAdminAccess } from "@/lib/auth/admin"
import { authConfig } from "@/lib/auth/config"
import { getBusiness } from "@/lib/business"
import { settingsFromGraphQL } from "@/lib/businessSettings"
import { RESUME_SETTINGS_FIELDS } from "@/lib/resume"
import { cn } from "@/lib/utils"
import { LANGUAGE_PARAM, parseLanguage } from "@/app/admin/components/translations/languages"

import CrumbsSetter from "../components/Breadcrumbs/CrumbsSetter"
import { getKnowledgeSources } from "../components/getKnowledgeSources"
import Administrators from "./components/administrators/Administrators"
import BusinessSettingsForm from "./components/business/BusinessSettingsForm"
import ApiKeys from "./components/developer/ApiKeys"
import SettingsForm from "./components/form/SettingsForm"
import HandoffSettingsForm from "./components/handoff/HandoffSettingsForm"
import { HANDOFF_SETTINGS_FIELDS } from "./components/handoff/query"
import KnowledgeSourcesForm from "./components/knowledge/KnowledgeSourcesForm"
import ResumeSettingsForm from "./components/resumes/ResumeSettingsForm"

export const metadata: Metadata = {
  title: "Company Settings",
}

interface IProps {
  // ?tab=business shows the business settings, ?tab=handoff the enquiry and booking settings, ?tab=knowledge the knowledge
  // sources, ?tab=resumes the resume settings, ?tab=administrators the admins (local sign-in mode only), ?tab=developer the API keys, the company's content
  // otherwise. ?language= opens the content in that language, English by default
  searchParams: Promise<{ tab?: string | string[]; [LANGUAGE_PARAM]?: string | string[] }>
}

// Every business setting, including the agent's private guidance, null before the onboarding wizard has run, or undefined
// when they couldn't be loaded
async function getBusinessSettings() {
  const client = await getAdminClient()

  try {
    const { data } = await client.query<Query>({
      query: gql`
        query BusinessSettings {
          businessSettings {
            businessName
            websiteUrl
            careersUrl
            contactUrl
            contactEmail
            contactPhone
            assistantName
            avatarUrl
            logoUrl
            primaryColor
            defaultLanguage
            starters {
              icon
              label {
                language
                text
              }
              message {
                language
                text
              }
            }
            greeting {
              language
              text
            }
            agentDescription
            agentGuidance
            updatedAt
          }
        }
      `,
      fetchPolicy: "no-cache",
    })
    return data?.businessSettings ?? null
  } catch {
    return undefined
  }
}

// The resume settings as entered, their defaults until first saved, or undefined when they couldn't be loaded
async function getResumeSettings() {
  const client = await getAdminClient()

  try {
    const { data } = await client.query<Query>({
      query: gql`
        query AdminResumeSettings {
          resumeSettings {
            ...ResumeSettingsFields
          }
        }
        ${RESUME_SETTINGS_FIELDS}
      `,
      fetchPolicy: "no-cache",
    })
    return data?.resumeSettings
  } catch {
    return undefined
  }
}

// The enquiry and booking settings, their defaults until first saved, or undefined when they couldn't be loaded
async function getHandoffSettings() {
  const client = await getAdminClient()

  try {
    const { data } = await client.query<Query>({
      query: gql`
        query HandoffSettings {
          handoffSettings {
            ...HandoffSettingsFields
          }
        }
        ${HANDOFF_SETTINGS_FIELDS}
      `,
      fetchPolicy: "no-cache",
    })
    return data?.handoffSettings
  } catch {
    return undefined
  }
}

const TABS = [
  { id: "company", label: "Company knowledge", icon: BookOpen, description: "What the assistant knows about your company and can tell visitors." },
  {
    id: "business",
    label: "Business identity",
    icon: IdCard,
    description: "Manage the public chat’s identity, appearance and behaviour. Company knowledge is maintained in the other tab.",
  },
  {
    id: "handoff",
    label: "Enquiries & booking",
    icon: CalendarClock,
    description: "What the assistant asks prospects, and how they reach your team: a booking page, the in-chat calendar or an enquiry sent to you.",
  },
  {
    id: "knowledge",
    label: "Knowledge sources",
    icon: Library,
    description: "Choose which optional sources Lumi answers from besides your websites, and what your business calls them.",
  },
  {
    id: "resumes",
    label: "Resumes",
    icon: FileText,
    description: "Whether Lumi offers your team members' PDF resumes, and the logo and colours they use.",
  },
  // Local sign-in mode only
  { id: "administrators", label: "Administrators", icon: UserCog, description: "The people who sign in to this admin with an email and password." },
  {
    id: "developer",
    label: "Developer",
    icon: KeyRound,
    description: "API keys that let your own systems, such as your website, read from or manage Lumi.",
  },
] as const

type TabId = (typeof TABS)[number]["id"]

const tabHref = (id: TabId) => (id === "company" ? "/admin/settings" : `/admin/settings?tab=${id}`)

// Every admin account, oldest first, or undefined when they couldn't be loaded
async function getAdminAccounts() {
  const client = await getAdminClient()

  try {
    const { data } = await client.query<Query>({
      query: gql`
        query AdminAccounts {
          adminAccounts {
            id
            email
            name
            mustChangePassword
            lastSignInAt
          }
        }
      `,
      fetchPolicy: "no-cache",
    })
    return data?.adminAccounts
  } catch {
    return undefined
  }
}

// The active API keys, newest first, or undefined when they couldn't be loaded. Only the web app's server can list them
async function getApiKeys() {
  const client = await getAdminClient()

  try {
    const { data } = await client.query<Query>({
      query: gql`
        query ApiKeys {
          apiKeys {
            id
            name
            access
            lastCharacters
            createdAt
            createdBy
            lastUsedAt
          }
        }
      `,
      fetchPolicy: "no-cache",
    })
    return data?.apiKeys
  } catch {
    return undefined
  }
}

// The company, undefined until it's first saved, or null when it couldn't be loaded
async function getCompany() {
  const client = await getAdminClient()

  try {
    const { data } = await client.query<Query>({
      query: gql`
        query {
          company {
            email
            founding_story
            mission
            location
            phone
            values
            vision
            webpage
            translations {
              language
              founding_story
              values
              vision
              mission
              updated_at
              outdated
              draft
            }
          }
        }
      `,
    })

    return data?.company || undefined
  } catch {
    return null
  }
}

export default async function SettingsPage({ searchParams }: IProps) {
  const params = await searchParams
  const tabs = TABS.filter(({ id }) => id !== "administrators" || authConfig.mode === "local")
  const requested = Array.isArray(params.tab) ? params.tab[0] : params.tab
  const tab: TabId = tabs.find(({ id }) => id === requested)?.id ?? "company"

  return (
    <div>
      <CrumbsSetter crumbs={[{ label: "Dashboard", href: "/admin" }, { label: "Company Settings" }]} />
      <h1 className="mb-3 text-2xl font-semibold">Company Settings</h1>
      <nav aria-label="Settings sections" className="mb-3 flex gap-1 overflow-x-auto border-b border-slate-200">
        {tabs.map(({ id, label, icon: Icon }) => (
          <Link
            key={id}
            href={tabHref(id)}
            aria-current={tab === id ? "page" : undefined}
            className={cn(
              "-mb-px flex items-center gap-2 rounded-t-md border px-3 py-2 text-sm font-medium whitespace-nowrap",
              tab === id ? "border-slate-200 border-b-white bg-white text-slate-900" : "border-transparent text-slate-600 hover:text-slate-900"
            )}
          >
            <Icon size={16} aria-hidden className={tab === id ? "text-blue-700" : undefined} />
            {label}
          </Link>
        ))}
      </nav>
      <p className="mb-5 text-sm text-slate-600">{TABS.find(({ id }) => id === tab)?.description}</p>
      {tab === "business" ? (
        <BusinessTab />
      ) : tab === "handoff" ? (
        <HandoffTab />
      ) : tab === "knowledge" ? (
        <KnowledgeTab />
      ) : tab === "resumes" ? (
        <ResumesTab />
      ) : tab === "administrators" ? (
        <AdministratorsTab />
      ) : tab === "developer" ? (
        <DeveloperTab />
      ) : (
        <CompanyTab language={parseLanguage(params[LANGUAGE_PARAM])} />
      )}
    </div>
  )
}

async function CompanyTab({ language }: { language: ReturnType<typeof parseLanguage> }) {
  const company = await getCompany()
  return company === null ? (
    // Not the empty form, which would read as a company with nothing saved and save over the real one
    <p className="text-sm text-red-600">The company settings couldn&apos;t be loaded. Reload the page to try again.</p>
  ) : (
    <SettingsForm company={company} language={language} />
  )
}

async function BusinessTab() {
  const settings = await getBusinessSettings()
  if (settings === undefined) {
    // Not the empty form, which would save over the real settings
    return <p className="text-sm text-red-600">The business settings couldn&apos;t be loaded. Reload the page to try again.</p>
  }
  if (settings === null) {
    return (
      <p className="text-sm">
        Lumi isn&apos;t set up yet.{" "}
        <a href="/setup" className="font-medium text-blue-700 underline">
          Run the setup
        </a>{" "}
        to enter the business settings, then edit them here.
      </p>
    )
  }
  return <BusinessSettingsForm key={settings.updatedAt} settings={settingsFromGraphQL(settings)} />
}

async function HandoffTab() {
  const [settings, business] = await Promise.all([getHandoffSettings(), getBusiness().catch(() => null)])
  if (!settings) {
    // Not the default form, which would save over the real settings
    return <p className="text-sm text-red-600">The enquiry and booking settings couldn&apos;t be loaded. Reload the page to try again.</p>
  }
  return <HandoffSettingsForm key={settings.updatedAt ?? "defaults"} settings={settings} contact={business ? contactHref(business) : undefined} />
}

async function KnowledgeTab() {
  const sources = await getKnowledgeSources()
  if (!sources) {
    // Not the form, whose switches would save over the real choices
    return <p className="text-sm text-red-600">The knowledge sources couldn&apos;t be loaded. Reload the page to try again.</p>
  }
  return <KnowledgeSourcesForm key={JSON.stringify(sources)} sources={sources} />
}

async function ResumesTab() {
  const [settings, business] = await Promise.all([getResumeSettings(), getBusiness().catch(() => null)])
  if (!settings) {
    // Not the default form, which would save over the real settings
    return <p className="text-sm text-red-600">The resume settings couldn&apos;t be loaded. Reload the page to try again.</p>
  }
  return (
    <ResumeSettingsForm
      key={settings.updatedAt ?? "defaults"}
      settings={settings}
      businessName={business?.businessName ?? ""}
      websiteUrl={business?.websiteUrl}
    />
  )
}

async function AdministratorsTab() {
  const user = await requireAdminAccess()
  const accounts = await getAdminAccounts()
  if (!accounts) {
    return <p className="text-sm text-red-600">The admins couldn&apos;t be loaded. Reload the page to try again.</p>
  }
  return <Administrators accounts={accounts} currentId={user.id} />
}

async function DeveloperTab() {
  await requireAdminAccess()
  const apiKeys = await getApiKeys()
  if (!apiKeys) {
    return <p className="text-sm text-red-600">The API keys couldn&apos;t be loaded. Reload the page to try again.</p>
  }
  return <ApiKeys apiKeys={apiKeys} />
}
