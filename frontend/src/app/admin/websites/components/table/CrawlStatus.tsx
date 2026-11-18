"use client"

import { useState, type MouseEvent, type ReactNode } from "react"
import { useRouter } from "next/navigation"
import { WebsiteCrawlKind, WebsiteCrawlStatus, type WebsiteCrawl } from "@/generated/graphql"
import { WEBSITE_CRAWL_LIMITS } from "@lumi/shared-contracts/knowledge"
import { CircleAlert, CircleCheck, CirclePause, CircleSlash, LoaderCircle, TriangleAlert } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { LoadingButton, LoadingButtonState } from "@/components/ui/loading-button"
import { Progress } from "@/components/ui/progress"
import { useToast } from "@/components/ui/use-toast"

import { formatCount, formatDateTime, formatNumber } from "../../../components/dashboard/format"
import { updateWebsitePages } from "../../actions"

// Pages checked out of the sitemap's, once it was read
function progress(crawl: WebsiteCrawl) {
  return crawl.pagesTotal == null ? `${crawl.pagesChecked} pages` : `${crawl.pagesChecked} / ${crawl.pagesTotal}`
}

// What the crawl changed so far: new or modified pages it crawled, and pages removed with their search content
function changes(crawl: WebsiteCrawl) {
  const parts = [
    crawl.pagesProcessed > 0 && `${formatNumber(crawl.pagesProcessed)} new or changed`,
    crawl.pagesRemoved > 0 && `${formatCount(crawl.pagesRemoved, "page")} removed`,
  ].filter(Boolean)
  return parts.length ? parts.join(" · ") : undefined
}

// The outcome of a crawl that got through the sitemap: its changes, and the pages it left out over the page limit
function CrawlOutcome({ crawl, noChanges }: { crawl: WebsiteCrawl; noChanges?: string }) {
  const summary = changes(crawl) ?? noChanges
  if (!summary && !crawl.pagesOverLimit) return null

  return (
    <div className="flex max-w-[300px] flex-col gap-0.5 text-xs">
      {summary && <span className="text-muted-foreground">{summary}</span>}
      {crawl.pagesOverLimit > 0 && (
        <span className="flex items-start gap-1 text-amber-700">
          <TriangleAlert size={13} aria-hidden className="mt-px shrink-0" />
          <span>
            {formatCount(crawl.pagesOverLimit, "page")} left out: the limit is {formatNumber(WEBSITE_CRAWL_LIMITS.maxPages)} per crawl. Exclude paths
            Lumi doesn&apos;t need.
          </span>
        </span>
      )}
    </div>
  )
}

interface CrawlAgainProps {
  websiteId: string
  // A Re-process is continued as one, so it stays labelled as such
  kind: WebsiteCrawlKind
  text: string
}

// Starts Update Pages again, which crawls the pages an ended crawl didn't get to
function CrawlAgainButton({ websiteId, kind, text }: CrawlAgainProps) {
  const [loading, setLoading] = useState<LoadingButtonState>(LoadingButtonState.Idle)
  const { toast } = useToast()
  const router = useRouter()

  async function handleContinue(e: MouseEvent) {
    // Clicking the row opens the website
    e.stopPropagation()
    setLoading(LoadingButtonState.Loading)
    try {
      const updated = await updateWebsitePages(websiteId, kind)
      if (!updated.ok) {
        toast({ variant: "destructive", title: "Error", description: updated.error })
      }
    } catch (error) {
      // The action itself failed, as when the network is down
      console.error(error)
      toast({ variant: "destructive", title: "Error", description: "Failed to start updating the pages" })
    }
    // Also when the crawl didn't start, which may be recorded as failed
    router.refresh()
    setLoading(LoadingButtonState.Idle)
  }

  return <LoadingButton variant="outline" className="h-7 px-2 text-xs" state={loading} text={text} loadingText="Starting…" onClick={handleContinue} />
}

interface IProps {
  websiteId: string
  crawl?: WebsiteCrawl | null
  // The company time zone, as the Last Processed column, so the two can be compared: it renders on the server too
  timeZone: string
}

// The website's latest crawl: starting, its progress while running, or how it ended
export default function CrawlStatus({ websiteId, crawl, timeZone }: IProps) {
  if (!crawl) {
    return (
      <span className="text-muted-foreground">
        <span aria-hidden>—</span>
        <span className="sr-only">No crawl recorded</span>
      </span>
    )
  }

  let icon: ReactNode
  let label: string
  let detail: ReactNode = null

  switch (crawl.status) {
    case WebsiteCrawlStatus.Queued:
      icon = <LoaderCircle size={15} className="text-muted-foreground motion-safe:animate-spin" />
      label = "Starting…"
      break
    case WebsiteCrawlStatus.Running:
      icon = <LoaderCircle size={15} className="text-muted-foreground motion-safe:animate-spin" />
      if (crawl.pagesTotal == null) {
        label = "Reading sitemap…"
      } else {
        label = `Crawling ${crawl.pagesChecked} / ${crawl.pagesTotal} pages`
        detail = (
          <>
            <Progress value={crawl.pagesChecked} max={crawl.pagesTotal} aria-label="Crawl progress" className="w-40" />
            <CrawlOutcome crawl={crawl} />
          </>
        )
      }
      break
    case WebsiteCrawlStatus.Completed:
      icon = <CircleCheck size={15} className="text-green-600" />
      label = crawl.finishedAt ? `Up to date · ${formatDateTime(crawl.finishedAt, timeZone)}` : "Up to date"
      detail = <CrawlOutcome crawl={crawl} noChanges="No changes found" />
      break
    case WebsiteCrawlStatus.Stopped:
      icon = <CirclePause size={15} className="text-amber-500" />
      label = `Stopped: ran out of time (${progress(crawl)})`
      detail = (
        <>
          <CrawlOutcome crawl={crawl} />
          <CrawlAgainButton websiteId={websiteId} kind={crawl.kind} text="Continue" />
        </>
      )
      break
    case WebsiteCrawlStatus.Failed:
      icon = <CircleAlert size={15} className="text-destructive" />
      label = "Failed"
      // The reason in full, as long ones wrap rather than being cut short
      detail = (
        <>
          <span className="text-muted-foreground line-clamp-3 max-w-[300px] text-xs">{crawl.error || "Unknown error"}</span>
          <CrawlOutcome crawl={crawl} />
          <CrawlAgainButton websiteId={websiteId} kind={crawl.kind} text="Try again" />
        </>
      )
      break
    case WebsiteCrawlStatus.NotStarted:
      icon = <CircleSlash size={15} className="text-amber-500" />
      label = "Didn't start"
      detail = <CrawlAgainButton websiteId={websiteId} kind={crawl.kind} text="Try again" />
      break
    case WebsiteCrawlStatus.Interrupted:
      icon = <CircleAlert size={15} className="text-amber-500" />
      label = crawl.pagesTotal == null ? "Interrupted" : `Interrupted (${progress(crawl)})`
      detail = (
        <>
          <CrawlOutcome crawl={crawl} />
          <CrawlAgainButton websiteId={websiteId} kind={crawl.kind} text="Continue" />
        </>
      )
      break
  }

  return (
    <div className="flex flex-col items-start gap-1.5">
      <div className="flex items-center gap-x-2">
        <span className="shrink-0" aria-hidden>
          {icon}
        </span>
        <span className="font-medium">{label}</span>
        {crawl.kind === WebsiteCrawlKind.Reprocess && (
          <Badge variant="outline" className="shrink-0 font-normal">
            Re-process
          </Badge>
        )}
      </div>
      {detail}
    </div>
  )
}
