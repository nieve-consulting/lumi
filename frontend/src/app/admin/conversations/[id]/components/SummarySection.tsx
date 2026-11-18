"use client"

import { useMemo, useState } from "react"
import type { Thread } from "@/generated/graphql"
import { Globe, Phone } from "lucide-react"
import { DateTime } from "luxon"
import { useStore } from "zustand"

import LumiMarkdown from "@/components/LumiMarkdown"

import { threadStore } from "../store"
import DeleteButton from "./DeleteButton"
import LangfuseButton from "./LangfuseButton"
import SummarizeButton from "./SummarizeButton"

interface IProps {
  thread: Thread
  // Link to the conversation's Langfuse session, only set when Langfuse is configured
  langfuseUrl?: string
  className?: string
}

// Decoded for reading, e.g. /servicios/diseño rather than /servicios/dise%C3%B1o, or as it is when it doesn't decode
function readable(text: string) {
  try {
    return decodeURI(text)
  } catch {
    return text
  }
}

// The page a conversation started on, which the agents API only records as an http(s) URL on the installation's own sites.
// Shown without the protocol and with its campaign parameters, the full URL as its title. The link leaves them out, so the
// team's visits don't count towards the visitor's campaign in the website's analytics
function startingPage(pageUrl: string | null | undefined) {
  if (!pageUrl) return undefined
  try {
    const url = new URL(pageUrl)
    const path = url.pathname === "/" && !url.search ? "" : url.pathname
    return { href: `${url.origin}${url.pathname}`, label: readable(`${url.host}${path}${url.search}`), title: readable(url.toString()) }
  } catch {
    return undefined
  }
}

export default function SummarySection({ thread, langfuseUrl, className }: IProps) {
  const store = useMemo(
    () =>
      threadStore(
        thread.id,
        thread.topic || "Ongoing Conversation",
        thread.summary || "",
        thread.email || undefined,
        thread.name || undefined,
        thread.phone || undefined
      ),
    [thread]
  )
  const storeData = useStore(store)
  const [data, setData] = useState<{ summary?: string; topic?: string; email?: string; name?: string }>(storeData)

  store.subscribe(({ topic, summary, email, name }) => setData({ topic, summary, email, name }))
  const { summarize, deleteThread } = storeData
  const { topic, summary, email, name } = data || {}
  const page = startingPage(thread.pageUrl)

  return (
    <div className={className}>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-x-4">
        <div className="min-w-0">
          <div className="mb-0 text-2xl font-black">{topic}</div>
          <div className="mt-2">
            <div className="text-xs text-slate-500">
              Started on {DateTime.fromISO(thread.createdAt).toFormat("LLL d, yyyy HH:mm")}{" "}
              {email && (
                <>
                  by <b>{name ? `${name} <${email}>` : email}</b>
                </>
              )}
            </div>
            {/* The link positions its hidden new-tab note, so it's clipped with the truncated URL instead of widening the page */}
            {page && (
              <div className="mt-2 flex min-w-0 items-center text-xs text-slate-500">
                <Globe className="mr-1 shrink-0" size={15} aria-hidden />
                <span className="mr-1 shrink-0">Started on page</span>
                <a
                  href={page.href}
                  title={page.title}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="relative truncate text-blue-700 underline"
                >
                  {page.label}
                  <span className="sr-only"> (opens in a new tab)</span>
                </a>
              </div>
            )}
            {thread.phone && (
              <div className="mt-2 text-xs text-slate-500">
                <Phone className="mr-1 inline-block" size={15} />
                {thread.phone}
              </div>
            )}
          </div>
        </div>
        <div className="my-4 flex flex-wrap gap-2">
          <DeleteButton deleteThread={deleteThread} />
          {langfuseUrl && <LangfuseButton href={langfuseUrl} />}
          <SummarizeButton summarize={summarize} />
        </div>
      </div>
      {summary && (
        <>
          <hr className="my-6" />
          <h3 className="text-lg font-semibold">Summary</h3>
          <LumiMarkdown>{summary}</LumiMarkdown>
        </>
      )}
    </div>
  )
}
