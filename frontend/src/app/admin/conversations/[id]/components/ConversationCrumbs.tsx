"use client"

import { useMemo } from "react"

import CrumbsSetter from "../../../components/Breadcrumbs/CrumbsSetter"
import { conversationListHref } from "../../components/table/urlState"

interface IProps {
  topic?: string | null
}

// The list link reads the saved search and filters, which only the browser knows
export default function ConversationCrumbs({ topic }: IProps) {
  const crumbs = useMemo(
    () => [
      { label: "Dashboard", href: "/admin" },
      { label: "Conversations", href: conversationListHref() },
      { label: topic || "Ongoing Conversation" },
    ],
    [topic]
  )

  return <CrumbsSetter crumbs={crumbs} />
}
