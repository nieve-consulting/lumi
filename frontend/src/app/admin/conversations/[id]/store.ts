"use client"

import type { SummaryChunk } from "@lumi/shared-contracts/pre-sales"
import { create } from "zustand"

import { deleteThread as deleteThreadApi } from "../actions"

// Reads the newline-delimited JSON summary stream: each line is the summary generated so far
async function* readSummary(threadId: string): AsyncGenerator<SummaryChunk> {
  const response = await fetch(`/admin/conversations/${encodeURIComponent(threadId)}/summary`, { method: "POST" })
  if (!response.ok || !response.body) {
    throw new Error(`Failed to summarize the conversation: ${response.status}`)
  }

  const reader = response.body.pipeThrough(new TextDecoderStream()).getReader()
  let buffer = ""

  while (true) {
    const { done, value } = await reader.read()
    if (done) break

    buffer += value
    const lines = buffer.split("\n")
    buffer = lines.pop() ?? ""

    for (const line of lines) {
      // Blank lines are keep-alives
      if (line.trim()) yield JSON.parse(line)
    }
  }

  if (buffer.trim()) yield JSON.parse(buffer)
}

interface ThreadStore {
  topic?: string
  summary?: string
  email?: string
  phone?: string
  name?: string
}

interface ThreadActions {
  summarize: () => Promise<void>
  deleteThread: () => Promise<void>
}

export const threadStore = (threadId: string, topic?: string, summary?: string, email?: string, name?: string, phone?: string) =>
  create<ThreadStore & ThreadActions>((set) => ({
    topic,
    summary,
    email,
    phone,
    name,
    deleteThread: async () => {
      await deleteThreadApi(threadId)
    },
    summarize: async () => {
      for await (const { summary, topic, email } of readSummary(threadId)) {
        set({ summary, topic, email })
      }
    },
  }))
