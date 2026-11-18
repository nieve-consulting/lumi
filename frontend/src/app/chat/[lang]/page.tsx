import type { Metadata } from "next"
import Image from "next/image"
import { redirect } from "next/navigation"

import { getBusiness } from "@/lib/business"
import { BusinessProvider } from "@/lib/BusinessProvider"
import { toBusiness } from "@/lib/businessSettings"
import { chatStarterSources } from "@/lib/chatSources"
import { getMessages } from "@/lib/i18n"
import { LanguageProvider } from "@/lib/i18n/LanguageProvider"
import { generateLanguageParams, languageFromParams } from "@/lib/i18n/params"
import { chatOffersResumes } from "@/lib/resume"
import { sourceCodeUrl } from "@/lib/sourceCode"
import BrandTheme from "@/components/Chat/BrandTheme"
import Chat from "@/components/Chat/Chat"
import { MadeBy } from "@/components/Chat/PageText"

import packageJon from "../../../../package.json"

const version = packageJon.version
const commitId = process.env.COMMIT_ID?.substring(0, 7) || process.env.VERCEL_GIT_COMMIT_SHA?.substring(0, 7) || "dev"

// The public chat at /, which the proxy rewrites to its language. Prerendered for each language on its first request, with
// the business's settings, until saving them expires it (see lib/business.ts and params.ts)
export const generateStaticParams = generateLanguageParams

type Props = { params: Promise<{ lang: string }> }

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  // An unknown language is a 404 whatever the settings
  const language = await languageFromParams(params)
  const business = await getBusiness()
  if (!business) return {}
  return {
    title: `${business.assistantName} | ${business.businessName}`,
    description: getMessages(language, business).metadata.description,
  }
}

export default async function Home({ params }: Props) {
  const language = await languageFromParams(params)
  const [settings, resumes, starterSources] = await Promise.all([getBusiness(), chatOffersResumes(), chatStarterSources()])
  // Until the onboarding wizard has run there is no business to chat for
  if (!settings) redirect("/setup")
  const business = toBusiness(settings)

  return (
    <BusinessProvider config={settings} resumes={resumes} starterSources={starterSources}>
      <BrandTheme primaryColor={business.primaryColor} />
      <LanguageProvider initialLanguage={language}>
        <div className="fixed top-0 flex h-16 w-full gap-3 border-b border-slate-300 bg-white px-5 py-1 shadow-md">
          {/* Decorative: the name next to it says who the assistant is */}
          <Image className="size-14 object-contain" src={business.avatar} alt="" width={100} height={100} />
          <div className="content-center text-2xl font-bold">{business.assistantName}</div>
        </div>
        <div className="h-screen w-full pt-20 pb-12">
          <Chat className="mx-4 h-full rounded-md" version={version} commitId={commitId} />
        </div>
        <div className="fixed bottom-4 w-full text-center text-xs text-slate-400">
          &copy; {new Date().getFullYear()}{" "}
          {business.websiteUrl ? (
            <a className="underline" href={business.websiteUrl}>
              {business.businessName}
            </a>
          ) : (
            business.businessName
          )}
          <span className="hidden md:inline">
            &nbsp;-&nbsp;
            <MadeBy sourceUrl={sourceCodeUrl()} />
          </span>
        </div>
      </LanguageProvider>
    </BusinessProvider>
  )
}
