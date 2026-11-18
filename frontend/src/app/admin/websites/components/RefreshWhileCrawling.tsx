"use client"

import { useEffect, useTransition } from "react"
import { useRouter } from "next/navigation"

// How often the page fetches the crawl's progress again
const REFRESH_INTERVAL = 3000

interface IProps {
  // Whether a crawl the page shows is starting or running
  crawling: boolean
}

// Refreshes the page's server data every few seconds while a crawl is starting or running, keeping the client state such as
// the table's sorting and pages. The next refresh waits for the last to render, so a slow API doesn't pile them up, and
// they stop once the refreshed data has no crawl in progress
export default function RefreshWhileCrawling({ crawling }: IProps) {
  const router = useRouter()
  const [refreshing, startTransition] = useTransition()

  useEffect(() => {
    if (!crawling || refreshing) return
    const timeout = setTimeout(() => startTransition(() => router.refresh()), REFRESH_INTERVAL)
    return () => clearTimeout(timeout)
  }, [crawling, refreshing, router])

  return null
}
