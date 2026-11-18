import { useEffect, useEffectEvent, useMemo, useRef, useState } from "react"
import { config } from "@/config"
import { useChat } from "@ai-sdk/react"
import { countCharacters, limitCodeOf, MAX_MESSAGE_LENGTH, readablePageUrl, type LimitCode, type TurnRequest } from "@lumi/shared-contracts/pre-sales"
import { DefaultChatTransport } from "ai"

import { useBusiness } from "@/lib/BusinessProvider"
import type { Messages } from "@/lib/i18n"
import { useI18n } from "@/lib/i18n/LanguageProvider"
import { AgentsApiError } from "@/lib/threads"
import { getMessageText, type LumiMessage } from "@/lib/types"

import { askPageUrl, GREETING_MESSAGE_ID, greetingMessage, useChatStore } from "../store/store"

// What the chat's error offers: Reload to try again, or the business's contact link when the assistant can't answer at all.
// Neither when the conversation can't go on: the closed conversation's notice offers to start a new one instead
export type ChatErrorAction = "reload" | "contact"

// The visitor's text for a limit that refused starting the conversation or a turn, and what it offers
function limitError(limit: LimitCode, t: Messages, hasContact: boolean): { message: string; action?: ChatErrorAction } {
  switch (limit) {
    case "rate_limited":
      return { message: t.errors.rateLimited, action: "reload" }
    case "thread_limit":
      return { message: t.errors.threadLimit }
    case "thread_closed":
      return { message: t.errors.threadClosed }
    case "unavailable":
      return hasContact ? { message: t.errors.unavailable, action: "contact" } : { message: t.errors.unavailableWithoutContact }
  }
}

interface IUserLumiChatOptions {
  pageTitle?: string
  // Which page the chat is on, e.g. the website page embedding it, asked once when the conversation starts to record it
  currentPageUrl?: () => Promise<string | undefined>
  // Whether each turn also sends the page the visitor is on now, asked with currentPageUrl, so the assistant can read the page
  // they ask about. Only the embedded chat does: the standalone chat page has no page of the website to read
  sendPageWithTurns?: boolean
}

export function useLumiChat(options?: IUserLumiChatOptions) {
  const { language, t } = useI18n()
  const { assistantName, greeting, contact } = useBusiness()
  // What the greeting depends on, kept stable across renders for the memos below
  const greetingBusiness = useMemo(() => ({ assistantName, greeting }), [assistantName, greeting])
  const [loadingThread, setLoadingThread] = useState(true)
  const [input, setInput] = useState("")
  const [statusMessage, setStatusMessage] = useState<string>()
  // The message that couldn't start the thread, for Reload to retry, and whether it went back into the draft. Kept with the
  // conversation it happened in, so a new conversation starts without it
  // code: the limit that refused it, if one did
  const [failedStart, setFailedStart] = useState<{ text: string; fromDraft: boolean; conversation: number; code?: LimitCode }>()
  // Whether the stored conversation couldn't load, for Reload to try again by counting attempts. Sending a message starts a
  // new conversation instead
  const [loadFailed, setLoadFailed] = useState(false)
  const [loadAttempt, setLoadAttempt] = useState(0)
  const { threadId, conversation, isCreatingThread, loadThreadFromLocalStorage, getThreadId, startNewThread, setClosed } = useChatStore()
  // The language when a message is sent, which may have changed while its thread started
  const languageRef = useRef(language)
  useEffect(() => {
    languageRef.current = language
  }, [language])

  // useChat keeps the transport from the first render, so per-request values (pageTitle, language, turnPageUrl) are passed as
  // body options instead. The page is asked right before the request, as the visitor may have moved since an earlier turn.
  // Stopping meanwhile still aborts the request, which then starts already aborted
  const [transport] = useState(
    () =>
      new DefaultChatTransport<LumiMessage>({
        api: `${config.agents.uri}/pre-sales`,
        prepareSendMessagesRequest: async ({ messages, body }) => {
          const threadId = getThreadId() // We can't use threadId from the store because it might have been updated by the time this is called
          if (!threadId) throw new Error("No chat thread to send the message to")
          // Filtered here, so only what the agents API may read leaves the browser
          const pageUrl = readablePageUrl(await askPageUrl(body?.turnPageUrl))

          return {
            body: {
              message: getMessageText(messages[messages.length - 1]),
              threadId,
              pageTitle: body?.pageTitle || "",
              language: body?.language,
              pageUrl,
            } satisfies TurnRequest,
          }
        },
      })
  )

  // Each conversation gets its own chat, so a new one starts without the last one's messages, error or response still
  // streaming, which is stopped
  const { messages, sendMessage, status, stop, setMessages, error, regenerate } = useChat<LumiMessage>({
    id: String(conversation),
    messages: [greetingMessage(language, greetingBusiness)],
    transport,
    onData: (dataPart) => {
      if (dataPart.type === "data-status") setStatusMessage(dataPart.data.message)
    },
    // The chat shows its own message instead of the technical one
    onError: (error) => console.error("Chat response failed", error),
  })
  const isLoading = status === "submitted" || status === "streaming"
  const lastMessage = useMemo(() => messages[messages.length - 1], [messages])

  const currentFailedStart = failedStart?.conversation === conversation ? failedStart : undefined
  // The limit that refused the last turn: the transport's error message is the agents API's error body
  const turnLimit = error ? limitCodeOf(error.message) : undefined

  const endsConversation = turnLimit === "thread_limit" || turnLimit === "thread_closed"

  // A conversation at its message limit, or closed meanwhile, e.g. by a booking in another tab, takes no more messages: it
  // closes, so the message box gives way to starting a new conversation
  useEffect(() => {
    if (endsConversation) setClosed(true)
  }, [endsConversation, setClosed])

  // The message it refused goes back into the draft, once per refusal, which a new conversation keeps, so the visitor can send
  // it there
  const [restoredFor, setRestoredFor] = useState<Error>()
  if (endsConversation && error && error !== restoredFor) {
    setRestoredFor(error)
    const refused = messages.findLast((message) => message.role === "user")
    const text = refused ? getMessageText(refused) : ""
    if (text) setInput((draft) => (draft ? `${text}\n\n${draft}` : text))
  }

  // It was never sent, so it also leaves the conversation, where the chat added it when sending: the refused request got no
  // reply, so it is the last message. In an effect, as it updates useChat's messages, once per refusal
  const removedFor = useRef<Error>(undefined)
  useEffect(() => {
    if (!endsConversation || !error || removedFor.current === error) return
    removedFor.current = error
    setMessages((current) => (current.at(-1)?.role === "user" ? current.slice(0, -1) : current))
  }, [endsConversation, error, setMessages])

  // Before the thread starts, the greeting follows the chat's language. Once the thread is starting it keeps the greeting it
  // starts with, and earlier messages are never rewritten
  const shownMessages = useMemo(
    () =>
      threadId || isCreatingThread
        ? messages
        : messages.map((message) => (message.id === GREETING_MESSAGE_ID ? greetingMessage(language, greetingBusiness) : message)),
    [threadId, isCreatingThread, messages, language, greetingBusiness]
  )

  // Reads the language when loading, without loading again on a language switch
  const loadStoredThread = useEffectEvent(() => loadThreadFromLocalStorage(language, greetingBusiness))

  useEffect(() => {
    if (!threadId) {
      ;(async function () {
        setLoadingThread(true)
        setLoadFailed(false)
        try {
          const { messages } = await loadStoredThread()
          setMessages(messages)
        } catch (error) {
          console.error("Failed to load the chat thread", error)
          setLoadFailed(true)
        }
        setLoadingThread(false)
      })()
    }
  }, [threadId, loadAttempt, setLoadingThread, setMessages])

  function handleInputChange(e: React.ChangeEvent<HTMLTextAreaElement>) {
    setInput(e.target.value)
  }

  // The first message starts the thread. If that fails, the error is shown with a retry instead of leaving the prompt waiting.
  // A message from the draft is put back in it, for the visitor to edit or resend; others, e.g. a conversation starter's,
  // leave the draft alone
  async function sendText(text: string, fromDraft = false) {
    setStatusMessage(undefined)
    setLoadFailed(false)
    setFailedStart(undefined)
    // The page for the turn, asked right before its request. A turn that starts the thread reuses the answer the thread starts
    // with, rather than asking the embedding widget twice in a row
    let turnPageUrl = options?.sendPageWithTurns ? options.currentPageUrl : undefined
    if (!getThreadId()) {
      // The conversation the message was sent in, as the visitor can start a new one while the thread starts
      const { conversation } = useChatStore.getState()
      // The chat keeps the greeting the thread starts with, also if the visitor switches language meanwhile
      setMessages((messages) =>
        messages.map((message) => (message.id === GREETING_MESSAGE_ID ? greetingMessage(language, greetingBusiness) : message))
      )
      try {
        // A message sent in a conversation the visitor has left meanwhile goes with it
        const pageUrl = askPageUrl(options?.currentPageUrl)
        if (turnPageUrl) turnPageUrl = () => pageUrl
        if (!(await startNewThread(language, () => pageUrl))) return
      } catch (error) {
        console.error("Failed to start a chat thread", error)
        if (useChatStore.getState().conversation !== conversation) return
        setFailedStart({ text, fromDraft, conversation, code: error instanceof AgentsApiError ? limitCodeOf(error) : undefined })
        if (fromDraft) setInput((draft) => (draft ? `${text}\n\n${draft}` : text))
        return
      }
    }

    // The fixed text of the turn, e.g. status updates, follows the language shown when it runs
    sendMessage({ text }, { body: { pageTitle: options?.pageTitle, language: languageRef.current, turnPageUrl } })
  }

  async function handleSubmit() {
    const text = input
    // Also from Reload, which the message box's limit doesn't cover. The message box says the draft is over the limit
    if (!text.trim() || countCharacters(text) > MAX_MESSAGE_LENGTH) return

    // Cleared before the thread starts, so anything typed meanwhile stays as the next draft
    setInput("")
    await sendText(text, true)
  }

  // Tries starting the thread again. A message from the draft is sent as the visitor left the draft, or as it was if they
  // cleared it; any other is sent again as it was
  async function retryStart() {
    if (!currentFailedStart) return

    const { text, fromDraft } = currentFailedStart
    if (fromDraft && input.trim()) await handleSubmit()
    else await sendText(text, fromDraft)
  }

  const limit = loadFailed ? undefined : currentFailedStart ? currentFailedStart.code : turnLimit
  const { message: errorMessage, action: errorAction } = limit
    ? limitError(limit, t, !!contact)
    : {
        message: loadFailed ? t.errors.load : currentFailedStart ? t.errors.start : error ? t.errors.reply : undefined,
        action: "reload" as const,
      }

  return {
    messages: shownMessages,
    statusMessage,
    loadingThread,
    isLoading,
    isThinking: isLoading && (lastMessage?.role !== "assistant" || getMessageText(lastMessage) === ""),
    input,
    stop,
    handleInputChange,
    handleSubmit,
    // Sends a message that isn't from the draft, e.g. a conversation starter's
    sendText: (text: string) => sendText(text),
    // Shown in the chat's language: the response's own error is technical
    error: errorMessage,
    errorAction: errorMessage ? errorAction : undefined,
    reload: loadFailed
      ? () => setLoadAttempt((attempt) => attempt + 1)
      : currentFailedStart
        ? retryStart
        : () =>
            regenerate({
              body: { pageTitle: options?.pageTitle, language, turnPageUrl: options?.sendPageWithTurns ? options.currentPageUrl : undefined },
            }),
  }
}
