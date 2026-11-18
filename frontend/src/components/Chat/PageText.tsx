"use client"

import { useI18n } from "@/lib/i18n/LanguageProvider"

// Text of the chat pages around the chat, in the chat's language so it follows a language switch

export function Tagline() {
  const { t } = useI18n()
  return <>{t.layout.tagline}</>
}

// Lumi's credit to Nieve, who make it, and the link to its source code (lib/sourceCode.ts). It's the product's, not the
// business's, so the credit is the same on every installation
export function MadeBy({ sourceUrl, newTab = false }: { sourceUrl: string; newTab?: boolean }) {
  const { t } = useI18n()
  const target = newTab ? "_blank" : undefined
  const opensInNewTab = newTab && <span className="sr-only"> {t.common.opensInNewTab}</span>
  return (
    <>
      {t.layout.madeWith}&nbsp;
      <a className="underline" href="https://www.nieveconsulting.com" target={target} rel={newTab ? "noopener noreferrer" : undefined}>
        Nieve
        {opensInNewTab}
      </a>
      &nbsp;{t.layout.madeIn} {/* Kept together, so a narrow widget wraps it onto a line of its own rather than splitting the link */}
      <span className="whitespace-nowrap">
        ·&nbsp;
        <a className="underline" href={sourceUrl} target={target} rel={newTab ? "noopener noreferrer" : undefined}>
          {t.layout.sourceCode}
          {opensInNewTab}
        </a>
      </span>
    </>
  )
}
