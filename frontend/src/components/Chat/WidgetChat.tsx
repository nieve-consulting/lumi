"use client"

import { useCallback, useEffect, useRef, useState } from "react"

import { useBusiness } from "@/lib/BusinessProvider"
import { useI18n } from "@/lib/i18n/LanguageProvider"
import { cn, isComposingKey } from "@/lib/utils"

import { useFocusOnClose } from "./hooks/focusOnClose"
import { useLumiChat } from "./hooks/lumiChat"
import Menu from "./Menu"
import Messages from "./Messages"
import Prompt, { type PromptHandle } from "./Prompt"
import { useChatStore } from "./store/store"

interface IProps {
  className?: string
  version: string
  commitId: string
  initialPageTitle?: string
}

// How long starting a conversation or a turn waits for the embedding widget to say which page it's on. Launchers older than
// the question, and other pages embedding the chat, never answer, so the conversation then records none and turns send none
const PAGE_URL_TIMEOUT = 500

export default function WidgetChat({ className, version, commitId, initialPageTitle }: IProps) {
  const { language, t } = useI18n()
  const { contact } = useBusiness()
  const [pageTitle, setPageTitle] = useState<string | undefined>(initialPageTitle)
  // Questions about the page waiting for the embedding widget's answer
  const pageUrlRequests = useRef(new Set<(pageUrl: string | undefined) => void>())
  // Whether the embedding widget left a question unanswered, after which questions don't wait for it, so a launcher that never
  // answers doesn't delay every turn. Its answer, however late, means it answers again
  const pageUrlUnanswered = useRef(false)
  const promptRef = useRef<PromptHandle>(null)
  const menuRef = useRef<HTMLButtonElement>(null)
  const startNewRef = useRef<HTMLButtonElement>(null)
  const composerRef = useRef<HTMLDivElement>(null)

  // Asks the embedding widget which page the chat is on, where the visitor is now rather than where the chat loaded, as they
  // may have moved around the site since. The page's URL stays in the browser until the conversation records it or a turn
  // sends it, filtered
  const currentPageUrl = useCallback(
    () =>
      new Promise<string | undefined>((resolve) => {
        if (window.parent === window) return resolve(undefined)
        // Still asked, so a launcher that answers late is waited for again
        window.parent.postMessage({ type: "REQUEST_PAGE_URL" }, "*")
        if (pageUrlUnanswered.current) return resolve(undefined)
        const requests = pageUrlRequests.current
        const answer = (pageUrl: string | undefined) => {
          clearTimeout(timeout)
          requests.delete(answer)
          resolve(pageUrl)
        }
        const timeout = setTimeout(() => {
          pageUrlUnanswered.current = true
          answer(undefined)
        }, PAGE_URL_TIMEOUT)
        requests.add(answer)
      }),
    []
  )

  const {
    messages,
    statusMessage,
    loadingThread,
    isLoading,
    isThinking,
    input,
    handleInputChange,
    handleSubmit,
    sendText,
    stop,
    error,
    errorAction,
    reload,
  } = useLumiChat({ pageTitle, currentPageUrl, sendPageWithTurns: true })
  const { closed, isCreatingThread } = useChatStore()

  // A closed conversation disables the message box, so focus goes to the closed notice's "Start new conversation" button,
  // or to the menu, which can also start one, while the notice isn't shown yet
  const focusChat = useCallback(() => {
    if (useChatStore.getState().closed) (startNewRef.current ?? menuRef.current)?.focus()
    else promptRef.current?.focus()
  }, [])

  // Moves focus off the disabled message box once the conversation closes, and again once its notice shows after loading:
  // from the menu focus fell back to before the notice showed, as the menu is in the composer. Only while the chat has focus,
  // so it never takes focus from the embedding page
  useFocusOnClose({ closed, loadingThread, composerRef, focusClosed: focusChat, afterLoad: true })

  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      // Sent with every turn, so only the embedding widget may say which page title the chat is on. Its origin is the host
      // website's, which can be any, so the sender is checked instead
      if (
        event.data?.type === "UPDATE_PAGE_TITLE" &&
        event.source === window.parent &&
        typeof event.data.pageTitle === "string" &&
        event.data.pageTitle
      ) {
        setPageTitle(event.data.pageTitle)
      }

      // Recorded with the conversation and read by the assistant, so only the embedding widget may say which page the chat is on
      if (event.data?.type === "PAGE_URL" && event.source === window.parent) {
        pageUrlUnanswered.current = false
        const pageUrl = typeof event.data.pageUrl === "string" ? event.data.pageUrl : undefined
        for (const answer of [...pageUrlRequests.current]) answer(pageUrl)
      }

      // The embedding widget moves focus into the chat when it opens. Only it may: other windows can't move focus here
      if (event.data?.type === "FOCUS_PROMPT" && event.source === window.parent) focusChat()
    }

    window.addEventListener("message", handleMessage)
    // A focus request sent while the page was loading went unheard, so the embedding widget sends another once it's ready
    if (window.parent !== window) window.parent.postMessage({ type: "CHAT_READY" }, "*")

    return () => {
      window.removeEventListener("message", handleMessage)
    }
  }, [focusChat])

  // Tells the embedding widget the chat's language on load and after each switch, so its labels follow the visitor's choice
  useEffect(() => {
    if (window.parent !== window) window.parent.postMessage({ type: "CHAT_LANGUAGE", language }, "*")
  }, [language])

  // Escape asks the embedding widget to close the chat. Open menus and dialogs handle Escape first and mark it as handled,
  // so it only closes them
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      // Escape that cancels IME composition isn't for closing
      if (event.key !== "Escape" || event.defaultPrevented || isComposingKey(event)) return
      window.parent.postMessage({ type: "CLOSE_CHAT" }, "*")
    }

    window.addEventListener("keydown", handleKeyDown)

    return () => {
      window.removeEventListener("keydown", handleKeyDown)
    }
  }, [])

  return (
    <div className={cn(className, "flex flex-col")}>
      <Messages
        startNewRef={startNewRef}
        promptRef={promptRef}
        onStart={sendText}
        className="mb-5 grow px-3"
        messages={messages}
        statusMessage={statusMessage}
        error={error}
        errorAction={errorAction}
        reload={reload}
        isLoading={loadingThread}
        isStreaming={isLoading}
        isThinking={isThinking}
        isCreatingThread={isCreatingThread}
        closed={closed}
      />
      <div className="mb-2 text-center text-xs text-slate-400">
        {t.disclaimer.widgetBefore}
        {contact ? (
          <a className="underline" href={contact} target="_blank" rel="noopener noreferrer">
            {t.disclaimer.link}
            <span className="sr-only"> {t.common.opensInNewTab}</span>
          </a>
        ) : (
          t.disclaimer.link
        )}
        {t.disclaimer.after}
      </div>
      <div ref={composerRef} className="mx-2 flex items-end gap-2">
        <Menu ref={menuRef} version={version} commitId={commitId} />
        <Prompt
          ref={promptRef}
          // The embedding widget asks for focus when the chat opens instead
          focusWhenVisible={false}
          className="grow"
          input={input}
          handleInputChange={handleInputChange}
          handleSubmit={handleSubmit}
          disabled={closed}
          isLoading={isLoading || isCreatingThread}
          handleCancel={stop}
        />
      </div>
    </div>
  )
}
