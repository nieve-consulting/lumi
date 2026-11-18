import type { Metadata } from "next"
import Image from "next/image"

import { getBusiness } from "@/lib/business"
import { BusinessProvider } from "@/lib/BusinessProvider"
import { toBusiness } from "@/lib/businessSettings"
import { chatStarterSources } from "@/lib/chatSources"
import { getMessages } from "@/lib/i18n"
import { LanguageProvider } from "@/lib/i18n/LanguageProvider"
import { languageFromParams } from "@/lib/i18n/params"
import { chatOffersResumes } from "@/lib/resume"
import { sourceCodeUrl } from "@/lib/sourceCode"
import BrandTheme from "@/components/Chat/BrandTheme"
import { MadeBy, Tagline } from "@/components/Chat/PageText"

// The /widget page, which the proxy rewrites to the language it resolves from the remembered choice or the widget's language
// option, which the launcher passes as the language query parameter. Rendered per request, as the page reads its query,
// with the business's settings from their cache (see lib/business.ts)

export async function generateMetadata({ params }: { params: Promise<{ lang: string }> }): Promise<Metadata> {
  // An unknown language is a 404 whatever the settings
  const language = await languageFromParams(params)
  const business = await getBusiness()
  if (!business) return {}
  return {
    title: `${business.assistantName} | ${business.businessName}`,
    description: getMessages(language, business).metadata.description,
  }
}

export default async function WidgetLayout({
  children,
  params,
}: Readonly<{
  children: React.ReactNode
  params: Promise<{ lang: string }>
}>) {
  const language = await languageFromParams(params)
  const [settings, resumes, starterSources] = await Promise.all([getBusiness(), chatOffersResumes(), chatStarterSources()])
  // Until the onboarding wizard has run. The wizard itself isn't offered inside another site's page
  if (!settings) {
    return (
      <main className="flex h-screen items-center justify-center bg-white p-6 text-center text-slate-600">
        <p>This assistant isn&apos;t available yet.</p>
      </main>
    )
  }
  const business = toBusiness(settings)

  return (
    <BusinessProvider config={settings} resumes={resumes} starterSources={starterSources}>
      <BrandTheme primaryColor={business.primaryColor} />
      <LanguageProvider initialLanguage={language}>
        <div className="fixed top-0 flex h-14 w-full gap-3 border-b border-slate-300 bg-white px-5 py-1">
          {/* Decorative: the name next to it says who the assistant is */}
          <Image className="size-10 object-contain" src={business.avatar} alt="" width={80} height={80} />
          <div className="content-center">
            <div className="font-bold">{business.assistantName}</div>
            <div className="text-xs font-normal text-slate-400">
              <Tagline />
            </div>
          </div>
        </div>
        <div className="h-screen w-full pt-14 pb-14">{children}</div>
        <div className="fixed bottom-4 w-full text-center text-xs text-slate-400">
          <MadeBy sourceUrl={sourceCodeUrl()} newTab />
        </div>
      </LanguageProvider>
    </BusinessProvider>
  )
}
