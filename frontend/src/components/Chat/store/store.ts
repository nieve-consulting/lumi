"use client"

import type { PublicBusinessConfig } from "@lumi/shared-contracts/business"
import type { Language } from "@lumi/shared-contracts/language"
import { greeting, normalizePageUrl } from "@lumi/shared-contracts/pre-sales"
import { create } from "zustand"

import { clearThreadId, getThreadId, setThreadId } from "@/lib/localStorage"
import { createNewThread, loadThread } from "@/lib/threads"
import type { LumiMessage } from "@/lib/types"

// The greeting shown before a thread exists: the business's, or the built-in one by the installation's assistant. It follows a
// language switch until the thread starts with it
export const GREETING_MESSAGE_ID = "initial"

export type GreetingBusiness = Pick<PublicBusinessConfig, "assistantName" | "greeting">

// Asks which page the chat is on. Not knowing it only leaves the page out, so a failed question never fails what asked it
export function askPageUrl(ask: (() => Promise<string | undefined>) | undefined) {
  return ask ? ask().catch(() => undefined) : Promise.resolve(undefined)
}

export function greetingMessage(language: Language, business: GreetingBusiness): LumiMessage {
  return { id: GREETING_MESSAGE_ID, role: "assistant", parts: [{ type: "text", text: greeting(language, business) }] }
}

interface ChatStore {
  threadId: string | null
  // Counts the new conversations the visitor started, so each resets the chat, also when no thread had started yet
  conversation: number
  closed: boolean
  isCreatingThread: boolean
}

interface ChatStoreActions {
  // Without a stored conversation, the assistant's greeting in the given language
  loadThreadFromLocalStorage: (language: Language, business: GreetingBusiness) => Promise<{ messages: LumiMessage[] }>
  setClosed: (closed: boolean) => void
  clearSessionThread: () => void
  // Resolves to whether the thread started for the conversation it was asked in, which the visitor may have left meanwhile
  // The thread's greeting is in the given language
  // currentPageUrl: asks which page the chat is on, e.g. the website page embedding it, recorded with the thread when known
  startNewThread: (language: Language, currentPageUrl?: () => Promise<string | undefined>) => Promise<boolean>
  getThreadId: () => string | null // This is a getter function because the threadId might change
}

export const useChatStore = create<ChatStore & ChatStoreActions>((set, get) => ({
  threadId: null,
  conversation: 0,
  stateConfig: null,
  closed: false,
  isCreatingThread: false,
  getThreadId: () => get().threadId,
  setClosed: (closed) => set({ closed }),
  clearSessionThread: () => {
    clearThreadId()
    // A thread still starting belongs to the conversation left behind
    set((state) => ({ threadId: null, closed: false, isCreatingThread: false, conversation: state.conversation + 1 }))
  },
  loadThreadFromLocalStorage: async (language, business) => {
    const threadId = getThreadId()

    if (threadId) {
      const thread = await loadThread(threadId)

      // A thread without messages has no checkpoint (e.g. it predates the agents API), so a fresh thread is started instead
      if (thread && thread.messages.length > 0) {
        set({ threadId, closed: thread.closed })
        return { messages: thread.messages }
      }
      clearThreadId()
    }

    return { messages: [greetingMessage(language, business)] }
  },
  startNewThread: async (language, currentPageUrl) => {
    const { conversation } = get()
    const isCurrent = () => get().conversation === conversation
    set({ isCreatingThread: true })
    try {
      // Asked once the thread starts, as the visitor may have moved around the site since the chat loaded. Filtered here, so
      // only what the thread records leaves the browser
      const pageUrl = normalizePageUrl(await askPageUrl(currentPageUrl))
      if (!isCurrent()) return false
      const { threadId } = await createNewThread({ language, pageUrl })
      // Not kept once the visitor started a new conversation, which starts its own thread
      if (!isCurrent()) return false
      setThreadId(threadId)
      set({ threadId, closed: false })
      return true
    } finally {
      if (isCurrent()) set({ isCreatingThread: false })
    }
  },
}))
