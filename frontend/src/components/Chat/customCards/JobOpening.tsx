import type { JobOpeningCard } from "@lumi/shared-contracts/knowledge"
import clsx from "clsx"
import { ExternalLink } from "lucide-react"
import { DateTime } from "luxon"

import { useBusiness } from "@/lib/BusinessProvider"
import { useFormattingLocale, useI18n } from "@/lib/i18n/LanguageProvider"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import LumiMarkdown from "@/components/LumiMarkdown"

interface IProps {
  job: JobOpeningCard
  className?: string
}

// A job opening the chat tells a candidate about, in the visitor's language, with where to apply: the opening's own
// application link, or the installation's careers page without one. Neither leaves the button out
export default function JobOpening({ job, className }: IProps) {
  const { t } = useI18n()
  const locale = useFormattingLocale()
  const { careersUrl } = useBusiness()
  const applyUrl = job.application_url || careersUrl
  const postedAt = job.posted_at ? DateTime.fromISO(job.posted_at, { setZone: true }) : undefined
  const workMode = t.cards.workModes[job.work_mode] ?? job.work_mode

  return (
    <Card className={clsx("max-w-[50%] min-w-[360px] border-indigo-300 bg-indigo-100", className)}>
      <CardHeader>
        <CardTitle className="mb-2">{job.title}</CardTitle>
        <div className="text-muted-foreground flex flex-wrap justify-between gap-x-4 text-sm">
          <div>{[job.location, workMode].filter(Boolean).join(" · ")}</div>
          {postedAt?.isValid && <div>{t.cards.postedOn(postedAt.toFormat(t.cards.postedDateFormat, { locale }))}</div>}
        </div>
        {job.summary && <CardDescription className="pt-2">{job.summary}</CardDescription>}
      </CardHeader>
      {/* Focusable, so keyboard users can scroll a long description */}
      {job.description && (
        <CardContent
          tabIndex={0}
          role="region"
          aria-label={job.title}
          className="focus-visible:ring-ring mb-5 max-h-[300px] overflow-y-auto rounded-md outline-hidden focus-visible:ring-2"
        >
          <CardDescription className="prose prose-sm max-w-none">
            <LumiMarkdown>{job.description}</LumiMarkdown>
          </CardDescription>
        </CardContent>
      )}
      {applyUrl && (
        <CardFooter className="justify-end">
          <Button asChild variant="outline">
            <a href={applyUrl} className="no-underline" target="_blank" rel="noopener noreferrer">
              {job.application_url ? t.cards.apply : t.cards.careersPage} <ExternalLink className="ml-1 inline" size={15} aria-hidden />
              <span className="sr-only"> {t.common.opensInNewTab}</span>
            </a>
          </Button>
        </CardFooter>
      )}
    </Card>
  )
}
