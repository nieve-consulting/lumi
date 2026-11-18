"use client"

import { JSX, useCallback, useId, useState, type ReactNode } from "react"
import { useRouter } from "next/navigation"
import { WebsiteCrawlKind, type WebsiteCrawl } from "@/generated/graphql"
import { AlertTriangle, CircleFadingArrowUp, CircleX, EllipsisIcon, RotateCw, type LucideIcon } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { LoadingButton, LoadingButtonState } from "@/components/ui/loading-button"
import { useToast } from "@/components/ui/use-toast"

import { clearWebsitePages, updateWebsitePages } from "../actions"
import { isCrawling } from "./crawl"

type DialogProps = {
  name: "clear" | "reprocess" | "update"
  title: string
  message: JSX.Element
  cta: string
  ctaLoading: string
  ctaClassName?: string
  action: () => Promise<void>
}

interface IProps {
  websiteId: string
  // The website's latest crawl: while it's starting or running, the website can't be crawled or cleared
  crawl?: Pick<WebsiteCrawl, "status"> | null
  // A smaller trigger, for table rows
  compact?: boolean
  // More items, before the crawl actions
  children?: ReactNode
}

// A crawl action with a line saying what it does. The item is named by its title alone and described by that line, so a screen
// reader doesn't read both as one long name
function CrawlMenuItem({
  icon: Icon,
  title,
  description,
  disabled,
  onClick,
}: {
  icon: LucideIcon
  title: string
  description: string
  disabled: boolean
  onClick: () => void
}) {
  const titleId = useId()
  const descriptionId = useId()

  return (
    <DropdownMenuItem disabled={disabled} onClick={onClick} className="items-start" aria-labelledby={titleId} aria-describedby={descriptionId}>
      <Icon size={15} className="mt-0.5 mr-2 shrink-0" />
      <div>
        <div id={titleId}>{title}</div>
        <div id={descriptionId} className="text-muted-foreground text-xs">
          {description}
        </div>
      </div>
    </DropdownMenuItem>
  )
}

export default function WebsiteMenu({ websiteId, crawl, compact, children }: IProps) {
  const [dialogOpen, setDialogOpen] = useState(false)
  const [dialog, setDialog] = useState<DialogProps | null>(null)
  const [loading, setLoading] = useState<LoadingButtonState>(LoadingButtonState.Idle)
  const { toast } = useToast()
  // Refreshing after an action shows the crawl it started, and the page then refreshes until it ends
  const router = useRouter()
  const crawling = isCrawling(crawl)
  const crawlingHintId = useId()

  const onClearPagesSelected = useCallback(() => {
    setDialog({
      name: "clear",
      title: "Clear Processed Pages",
      message: (
        <div className="flex gap-x-6">
          <div className="content-center text-center text-amber-400">
            <AlertTriangle className="inline" size={45} />
          </div>
          <div>
            <div>
              This deletes all of the website&rsquo;s processed pages. The assistant can&rsquo;t use the website until it&rsquo;s crawled again.
            </div>
            <div className="mt-2">This can&rsquo;t be undone. Are you sure?</div>
          </div>
        </div>
      ),
      cta: "Clear",
      ctaLoading: "Clearing...",
      ctaClassName: "bg-destructive text-destructive-foreground",
      action: async () => {
        setLoading(LoadingButtonState.Loading)
        try {
          const cleared = await clearWebsitePages(websiteId)
          if (!cleared.ok) {
            throw new Error(cleared.error)
          }
          toast({ title: "Success", description: "Processed pages cleared" })
          router.refresh()
        } catch (e) {
          const error = e as Error
          console.error(error)
          toast({ variant: "destructive", title: "Error", description: error.message })
        }
        setLoading(LoadingButtonState.Idle)
        setDialogOpen(false)
      },
    })
    setDialogOpen(true)
  }, [router, toast, websiteId])

  const onReprocessSitemap = useCallback(() => {
    setDialog({
      name: "reprocess",
      title: "Re-process Sitemap",
      message: (
        <div className="flex gap-x-6">
          <div className="content-center text-center text-amber-400">
            <AlertTriangle className="inline" size={45} />
          </div>
          <div>
            <div>
              This deletes all of the website&rsquo;s pages, then processes every page in the sitemap again, even those that haven&rsquo;t changed.
              Until each page is processed again, the assistant can&rsquo;t use it.
            </div>
            <div className="mt-2">
              It takes longer and costs more than Update Pages, which only processes new and changed pages. To pick up website changes, cancel and use
              Update Pages instead.
            </div>
            <div className="mt-2">This can&rsquo;t be undone. Are you sure?</div>
          </div>
        </div>
      ),
      cta: "Re-process",
      ctaLoading: "Re-processing...",
      ctaClassName: "bg-destructive text-destructive-foreground",
      action: async () => {
        setLoading(LoadingButtonState.Loading)
        try {
          const cleared = await clearWebsitePages(websiteId)
          if (!cleared.ok) {
            throw new Error(cleared.error)
          }
          const updated = await updateWebsitePages(websiteId, WebsiteCrawlKind.Reprocess)
          if (!updated.ok) {
            throw new Error(updated.error)
          }
          toast({ title: "Crawl requested", description: "Re-process will start shortly." })
        } catch (e) {
          const error = e as Error
          console.error(error)
          toast({ variant: "destructive", title: "Error", description: error.message })
        }
        // Also when the crawl didn't start, as the pages may have been cleared
        router.refresh()
        setLoading(LoadingButtonState.Idle)
        setDialogOpen(false)
      },
    })
    setDialogOpen(true)
  }, [router, toast, websiteId])

  const onUpdateSitemap = useCallback(() => {
    setDialog({
      name: "update",
      title: "Update Pages",
      message: (
        <div>
          <div>
            This checks the sitemap and processes new pages and pages whose text changed. Pages whose sitemap date is older than their last check are
            skipped without being read, and pages no longer listed are removed.
          </div>
        </div>
      ),
      cta: "Update",
      ctaLoading: "Updating...",
      action: async () => {
        setLoading(LoadingButtonState.Loading)
        try {
          const updated = await updateWebsitePages(websiteId)
          if (!updated.ok) {
            throw new Error(updated.error)
          }
          toast({ title: "Crawl requested", description: "Update Pages will start shortly." })
        } catch (e) {
          const error = e as Error
          console.error(error)
          toast({ variant: "destructive", title: "Error", description: error.message })
        }
        // Also when the crawl didn't start, which may be recorded as failed
        router.refresh()
        setLoading(LoadingButtonState.Idle)
        setDialogOpen(false)
      },
    })
    setDialogOpen(true)
  }, [router, toast, websiteId])

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant={compact ? "ghost" : "secondary"}
            className={compact ? "data-[state=open]:bg-muted flex size-8 p-0" : "data-[state=open]:bg-muted size-10 rounded-full p-0"}
          >
            <EllipsisIcon className="size-4" />
            <span className="sr-only">{crawling ? "Open menu, crawl in progress" : "Open menu"}</span>
          </Button>
        </DropdownMenuTrigger>
        {/* Disabled items can't be focused, so the menu itself says why */}
        <DropdownMenuContent align="end" className="w-[290px]" aria-describedby={crawling ? crawlingHintId : undefined}>
          {children && (
            <>
              {children}
              <DropdownMenuSeparator />
            </>
          )}
          {crawling && (
            <DropdownMenuLabel id={crawlingHintId} className="text-muted-foreground text-xs font-normal">
              A crawl is in progress. These are available once it ends.
            </DropdownMenuLabel>
          )}
          {/* Each says what it does, so Update Pages, the everyday one, isn't mistaken for Re-process, which costs far more */}
          <CrawlMenuItem
            icon={CircleFadingArrowUp}
            title="Update Pages"
            description="Picks up website changes: adds new pages, updates changed ones and removes those no longer listed."
            disabled={crawling}
            onClick={onUpdateSitemap}
          />
          <CrawlMenuItem
            icon={RotateCw}
            title="Re-process Sitemap"
            description="Deletes all pages and processes every page again. Slower and costs more than Update Pages."
            disabled={crawling}
            onClick={onReprocessSitemap}
          />
          <CrawlMenuItem
            icon={CircleX}
            title="Clear Processed Pages"
            description="Deletes all pages. The assistant can’t use the website until it’s crawled again."
            disabled={crawling}
            onClick={onClearPagesSelected}
          />
        </DropdownMenuContent>
      </DropdownMenu>
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{dialog?.title}</DialogTitle>
            <DialogDescription asChild>
              <div className="pt-4">{dialog?.message}</div>
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="secondary">
                Cancel
              </Button>
            </DialogClose>
            <LoadingButton
              state={loading}
              text={dialog?.cta}
              loadingText={dialog?.ctaLoading}
              onClick={dialog?.action}
              className={dialog?.ctaClassName}
            />
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
