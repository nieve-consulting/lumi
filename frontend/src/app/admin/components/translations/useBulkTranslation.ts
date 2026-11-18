"use client"

import { useEffect, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import type { Language } from "@lumi/shared-contracts/language"

import { TRANSLATION_FAILED } from "@/lib/translationMessages"
import type { TranslateDraftsRequest, TranslateDraftsResponse, TranslateDraftsType } from "@/app/api/translate/drafts/route"

import type { BulkTranslateMode } from "./languages"

// Where a record of a bulk translation stands: waiting its turn, being translated, saved as drafts (with how many fields
// were left untranslated), skipped as it had nothing to translate, failed with the reason, or stopped by cancelling
export type BulkItemState =
  | { status: "waiting" }
  | { status: "translating" }
  | { status: "saved"; untranslated: number }
  | { status: "skipped" }
  | { status: "failed"; error: string }
  | { status: "stopped" }

export interface BulkItem {
  id: string
  name: string
  state: BulkItemState
}

export interface BulkTranslation {
  // The batch's records in list order, empty before it starts
  items: BulkItem[]
  // Language the batch translates into
  language: Language | null
  // What the batch translates: what's missing in the language, or what's outdated there too
  mode: BulkTranslateMode
  running: boolean
  // Stopped while running: the records in flight finish, then the batch ends
  stopping: boolean
  // Translates the records' content into the language, what's missing or also what's outdated, a few at a time
  start: (records: { id: string; name: string }[], language: Language, mode: BulkTranslateMode) => void
  // Runs the failed records again
  retryFailed: () => void
  // Starts no more records: those in flight finish, so their drafts are saved and shown as they end, and the rest stay
  // untranslated
  stop: () => void
  // Forgets a finished batch
  reset: () => void
}

// Records translated at once: each is a model call taking up to minutes, so a few run side by side without flooding it
const CONCURRENCY = 3

async function translateRecord(
  type: TranslateDraftsType,
  id: string,
  language: Language,
  mode: BulkTranslateMode,
  runId: string,
  signal: AbortSignal
): Promise<BulkItemState> {
  try {
    const request: TranslateDraftsRequest = { type, id, language, mode, runId }
    const response = await fetch("/api/translate/drafts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(request),
      signal,
    })
    const body = (await response.json().catch(() => undefined)) as TranslateDraftsResponse | undefined
    if (signal.aborted) return { status: "stopped" }
    if (!response.ok || !body || "error" in body) return { status: "failed", error: body && "error" in body ? body.error : TRANSLATION_FAILED }
    return body.status === "saved" ? body : { status: "skipped" }
  } catch (e) {
    if (signal.aborted) return { status: "stopped" }
    console.error("Error translating record", e)
    return { status: "failed", error: TRANSLATION_FAILED }
  }
}

// Translates many records of a list with AI into drafts, one request per record (/api/translate/drafts), continuing past
// failures. Refreshes the page once a batch ends, so the list shows the drafts. Leaving the page aborts the requests in flight
export function useBulkTranslation(type: TranslateDraftsType): BulkTranslation {
  const [items, setItems] = useState<BulkItem[]>([])
  const [language, setLanguage] = useState<Language | null>(null)
  const [mode, setMode] = useState<BulkTranslateMode>("missing")
  const [running, setRunning] = useState(false)
  const [stopping, setStopping] = useState(false)
  // The running batch: aborting its controller cancels the requests in flight, which only leaving the page does, as a
  // request cancelled once its model call answered may still save its drafts, unknown to the batch
  const batchRef = useRef<{ controller: AbortController; stopped: boolean } | null>(null)
  // Groups the batch's model calls, retries included, in one Langfuse session
  const runIdRef = useRef("")
  const router = useRouter()

  useEffect(() => () => batchRef.current?.controller.abort(), [])

  // Reloading or closing the tab while it runs asks first
  useEffect(() => {
    if (!running) return
    const onBeforeUnload = (e: BeforeUnloadEvent) => e.preventDefault()
    window.addEventListener("beforeunload", onBeforeUnload)
    return () => window.removeEventListener("beforeunload", onBeforeUnload)
  }, [running])

  const setState = (id: string, state: BulkItemState) => setItems((items) => items.map((item) => (item.id === id ? { ...item, state } : item)))

  async function run(ids: string[], into: Language, translating: BulkTranslateMode) {
    const batch = { controller: new AbortController(), stopped: false }
    const { signal } = batch.controller
    batchRef.current = batch
    setRunning(true)
    setStopping(false)
    setItems((items) => items.map((item) => (ids.includes(item.id) ? { ...item, state: { status: "waiting" } } : item)))

    const queue = [...ids]
    const worker = async () => {
      while (queue.length > 0 && !batch.stopped && !signal.aborted) {
        const id = queue.shift()!
        setState(id, { status: "translating" })
        setState(id, await translateRecord(type, id, into, translating, runIdRef.current, signal))
      }
    }
    await Promise.all(Array.from({ length: Math.min(CONCURRENCY, ids.length) }, worker))
    // Records still waiting when the batch was stopped
    queue.forEach((id) => setState(id, { status: "stopped" }))

    if (batchRef.current === batch) batchRef.current = null
    setRunning(false)
    setStopping(false)
    router.refresh()
  }

  function start(records: { id: string; name: string }[], into: Language, translating: BulkTranslateMode) {
    if (running || records.length === 0) return
    setLanguage(into)
    setMode(translating)
    runIdRef.current = crypto.randomUUID()
    setItems(records.map(({ id, name }) => ({ id, name, state: { status: "waiting" } })))
    void run(
      records.map(({ id }) => id),
      into,
      translating
    )
  }

  function retryFailed() {
    const failed = items.filter((item) => item.state.status === "failed").map((item) => item.id)
    if (running || !language || failed.length === 0) return
    void run(failed, language, mode)
  }

  function reset() {
    if (running) return
    setItems([])
    setLanguage(null)
    setMode("missing")
  }

  function stop() {
    if (!batchRef.current) return
    batchRef.current.stopped = true
    setStopping(true)
  }

  return { items, language, mode, running, stopping, start, retryFailed, stop, reset }
}
