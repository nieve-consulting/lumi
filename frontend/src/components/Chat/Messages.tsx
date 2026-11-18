import { Fragment, useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from "react"
import Image from "next/image"
import { LoaderCircle, MessageCircleOff } from "lucide-react"

import { useBusiness } from "@/lib/BusinessProvider"
import { useI18n } from "@/lib/i18n/LanguageProvider"
import { getMessageText, type LumiMessage } from "@/lib/types"
import { cn, hasFinePointer } from "@/lib/utils"

import { Button } from "../ui/button"
import AssistantMessage from "./AssistantMessage"
import AssistantThinking from "./AssistantThinking"
import Error from "./Error"
import type { ChatErrorAction } from "./hooks/lumiChat"
import NewConversation from "./NewConversattion"
import type { PromptHandle } from "./Prompt"
import ScrollButton from "./ScrollButton"
import Starters from "./Starters"
import { useChatStore } from "./store/store"
import UserMessage from "./UserMessage"

interface IProps {
  // The closed conversation's "Start new conversation" button
  startNewRef?: React.Ref<HTMLButtonElement>
  // The message box, which takes focus from a conversation starter once it's used
  promptRef?: React.RefObject<PromptHandle | null>
  // Sends a conversation starter's message
  onStart: (message: string) => void
  messages: LumiMessage[]
  isLoading: boolean
  isStreaming: boolean
  isCreatingThread: boolean
  isThinking: boolean
  closed: boolean
  reload: () => void
  className?: string
  statusMessage?: string
  // In the chat's language
  error?: string
  // What the error offers, if anything
  errorAction?: ChatErrorAction
}

// Within this distance of the bottom the reader is reading the latest content, so new content scrolls into view
const NEAR_BOTTOM = 50
// Space above a new question when it's scrolled to the top
const QUESTION_MARGIN = 16
// A reply's start is in view once it's this far above the pane's bottom, clear of the scroll button over it
const REPLY_START_VISIBLE = 50

const isNearBottom = (area: HTMLElement) => area.scrollTop + area.clientHeight >= area.scrollHeight - NEAR_BOTTOM

export default function Messages({
  startNewRef,
  promptRef,
  onStart,
  className,
  messages,
  isLoading,
  isStreaming,
  isThinking,
  statusMessage,
  closed,
  isCreatingThread,
  error,
  errorAction,
  reload,
}: IProps) {
  const { t } = useI18n()
  const { avatar } = useBusiness()
  const [showScrollBtn, setShowScrollButton] = useState(false)
  const [newResponse, setNewResponse] = useState(false)
  const [newChatDlgOpen, setNewChatDlgOpen] = useState(false)
  const closedNoticeId = useId()
  const conversation = useChatStore((state) => state.conversation)

  const scrollableAreaRef = useRef<HTMLDivElement>(null)
  const contentRef = useRef<HTMLDivElement>(null)
  const lastHumanMessageRef = useRef<HTMLDivElement>(null)
  const latestReplyRef = useRef<HTMLDivElement>(null)
  const scrollButtonRef = useRef<HTMLButtonElement>(null)
  const reloadRef = useRef<HTMLButtonElement>(null)
  // Whether new content scrolls into view: while the reader is at the bottom, not while they read earlier messages
  const followRef = useRef(true)
  // After a new question, following stops once the question reaches the top, so its reply is read from the start
  const keepQuestionRef = useRef(false)
  // The latest reply whose start the reader has seen
  const seenReplyIdRef = useRef<string>(undefined)
  // The position last scrolled to, by the reader or this component. Only movement from it is the reader's, also when the
  // browser reports the reader's scroll in the same event as one of this component's
  const lastScrollTopRef = useRef(0)
  // The conversation in which focus moves to the message a starter or Reload sent once it shows, or to the error's Reload
  // button if it can't be sent. A message left behind with its conversation doesn't take focus later
  const focusSentRef = useRef<number>(undefined)

  const lastHumanMessageIdx = useMemo(() => messages.findLastIndex((m) => m.role === "user"), [messages])
  // Before the visitor's first message the chat welcomes them, and offers starters while nothing else is in the way
  const isFresh = !isLoading && lastHumanMessageIdx < 0
  const showStarters = isFresh && !closed && !isCreatingThread && !error
  const latestReplyIdx = useMemo(() => {
    const idx = messages.length - 1
    return messages[idx]?.role === "assistant" && getMessageText(messages[idx]) !== "" ? idx : -1
  }, [messages])
  const latestReplyId = latestReplyIdx < 0 ? undefined : messages[latestReplyIdx].id
  const latestReplyIdRef = useRef(latestReplyId)

  const autoScroll = useCallback((top: number) => {
    const area = scrollableAreaRef.current
    if (!area) return

    area.scrollTop = top
    lastScrollTopRef.current = area.scrollTop
  }, [])

  // Where following stops after a new question: with the question at the top. A question taller than half the pane stops at
  // its end in the middle instead, so the reply's start still shows below it
  const questionStop = useCallback(() => {
    const area = scrollableAreaRef.current
    const question = lastHumanMessageRef.current
    if (!area || !question) return null

    const contentTop = area.getBoundingClientRect().top - area.scrollTop
    const { top: questionTop, bottom: questionBottom } = question.getBoundingClientRect()
    return Math.max(questionTop - contentTop - QUESTION_MARGIN, questionBottom - contentTop - area.clientHeight / 2)
  }, [])

  // Scrolls to the bottom, but after a new question only until the question's stop
  const followLatest = useCallback(() => {
    const area = scrollableAreaRef.current
    if (!area) return

    let top = area.scrollHeight - area.clientHeight
    const stop = keepQuestionRef.current ? questionStop() : null
    if (stop !== null) top = Math.min(top, stop)
    autoScroll(top)
  }, [autoScroll, questionStop])

  // Moves focus from the button to the latest message, e.g. when the button goes away under it
  const focusLatest = useCallback(() => {
    const latest = latestReplyRef.current ?? lastHumanMessageRef.current
    latest?.focus({ preventScroll: true })
  }, [])

  // The button shows while the latest content is out of view, and says so when that's a reply whose start the reader hasn't
  // seen. A start above the pane's bottom has been in view, as the reader got past it
  const updateScrollButton = useCallback(() => {
    const area = scrollableAreaRef.current
    if (!area) return

    const nearBottom = isNearBottom(area)
    // E.g. after End or Page Down from the button
    if (nearBottom && document.activeElement === scrollButtonRef.current) focusLatest()
    const reply = latestReplyRef.current
    if (reply && reply.getBoundingClientRect().top < area.getBoundingClientRect().bottom - REPLY_START_VISIBLE) {
      seenReplyIdRef.current = latestReplyIdRef.current
    }
    setShowScrollButton(!nearBottom)
    setNewResponse(!!reply && seenReplyIdRef.current !== latestReplyIdRef.current)
  }, [focusLatest])

  useLayoutEffect(() => {
    latestReplyIdRef.current = latestReplyId
  }, [latestReplyId])

  // A conversation opens like after asking its last question, so its last reply is read from the start
  useLayoutEffect(() => {
    if (!isLoading) return

    followRef.current = true
    keepQuestionRef.current = true
  }, [isLoading])

  useLayoutEffect(() => {
    if (focusSentRef.current !== conversation) return

    // An error without Reload, e.g. a conversation at its limit, leaves focus on the sent message, if it shows
    const target = error && reloadRef.current ? reloadRef.current : lastHumanMessageIdx >= 0 ? lastHumanMessageRef.current : null
    if (!target) return
    focusSentRef.current = undefined
    target.focus({ preventScroll: true })
  }, [conversation, lastHumanMessageIdx, error])

  // A new question scrolls into view, wherever the reader was, and its reply is followed until the question reaches the top
  useLayoutEffect(() => {
    if (!isStreaming || lastHumanMessageIdx < 0) return

    followRef.current = true
    keepQuestionRef.current = true
    followLatest()
  }, [lastHumanMessageIdx, isStreaming, followLatest])

  // Following stops when the reader scrolls away from the bottom and resumes once they're back
  useEffect(() => {
    const scrollableArea = scrollableAreaRef.current
    if (!scrollableArea) return

    const handleScroll = () => {
      const { scrollTop, scrollHeight, clientHeight } = scrollableArea
      if (scrollTop !== lastScrollTopRef.current) {
        // Any scroll up leaves, even a small one by arrow key or touch, but not the browser keeping a shrinking pane at its bottom
        followRef.current = isNearBottom(scrollableArea) && (scrollTop > lastScrollTopRef.current || scrollTop >= scrollHeight - clientHeight - 1)
        // A reader who scrolls on past the question's stop to the bottom follows to the bottom from then on. Allows for the
        // rounding of the position scrolled to
        const stop = keepQuestionRef.current ? questionStop() : null
        if (followRef.current && stop !== null && scrollTop > stop + 1) keepQuestionRef.current = false
      }
      lastScrollTopRef.current = scrollTop
      updateScrollButton()
    }

    scrollableArea.addEventListener("scroll", handleScroll)
    return () => scrollableArea.removeEventListener("scroll", handleScroll)
  }, [questionStop, updateScrollButton])

  // Content grows as replies stream, cards load and notices show, and the pane changes size, e.g. when the prompt grows with a
  // long draft. The reader following is kept where following puts them, such as with the question at the top. For others
  // content changes stay put, and a shorter pane scrolls down by as much, so the messages at the bottom stay in view
  useEffect(() => {
    const scrollableArea = scrollableAreaRef.current
    const content = contentRef.current
    if (!scrollableArea || !content) return

    let height = scrollableArea.clientHeight
    const observer = new ResizeObserver(() => {
      const shrunkBy = height - scrollableArea.clientHeight
      height = scrollableArea.clientHeight
      if (followRef.current) followLatest()
      else if (shrunkBy > 0) autoScroll(scrollableArea.scrollTop + shrunkBy)
      updateScrollButton()
    })

    observer.observe(content)
    observer.observe(scrollableArea)
    return () => observer.disconnect()
  }, [autoScroll, followLatest, updateScrollButton])

  // A new response is shown from its start, like after asking; otherwise the latest message is at the bottom. Focus on the
  // button moves to that message: a new response is then read from its start, and at the bottom the button goes away. Focus
  // elsewhere stays, e.g. in the message box when a click doesn't focus the button (Safari)
  function scrollToLatest() {
    followRef.current = true
    keepQuestionRef.current = newResponse
    followLatest()
    if (document.activeElement === scrollButtonRef.current) focusLatest()
  }

  // Focus on a control that goes away once it sends, a starter or Reload, moves to the message box, ready for a follow-up.
  // Without a mouse or trackpad (phones, tablets on their own) that would open the on-screen keyboard over the reply, so it
  // moves to the sent message instead
  function keepFocus() {
    if (hasFinePointer()) promptRef?.current?.focus()
    else focusSentRef.current = conversation
  }

  function start(message: string, hadFocus: boolean) {
    if (hadFocus) keepFocus()
    onStart(message)
  }

  function retry() {
    if (document.activeElement === reloadRef.current) keepFocus()
    reload()
  }

  return (
    <div className={cn("flex flex-col gap-2 overflow-auto", className)} ref={scrollableAreaRef}>
      <div ref={contentRef} className="flex shrink-0 flex-col gap-2">
        {/* Kept small so the greeting, starters and message box fit on small screens */}
        {isFresh && <Image src={avatar} alt="" width={192} height={192} className="mt-2 size-16 self-center object-contain sm:size-24" />}
        {isLoading ? (
          <div className="text-center">
            <LoaderCircle className="mt-10 inline animate-spin" size={50} />
          </div>
        ) : (
          <>
            {messages.map((message, idx) => (
              <Fragment key={idx}>
                {message.role === "assistant" && getMessageText(message) !== "" && (
                  <AssistantMessage
                    ref={idx === latestReplyIdx ? latestReplyRef : undefined}
                    tabIndex={idx === latestReplyIdx ? -1 : undefined}
                    message={message}
                    isStreaming={isStreaming && idx === messages.length - 1}
                  />
                )}
                {message.role === "user" && (
                  <UserMessage
                    ref={idx === lastHumanMessageIdx ? lastHumanMessageRef : undefined}
                    tabIndex={idx === lastHumanMessageIdx ? -1 : undefined}
                    message={message}
                  />
                )}
              </Fragment>
            ))}
            {showStarters && <Starters onStart={start} />}
            {error && <Error ref={reloadRef} message={error} action={errorAction} reload={retry} />}
            {isThinking && <AssistantThinking toolProgress={statusMessage || t.messages.thinking} />}
            {isCreatingThread && <AssistantThinking toolProgress={t.messages.startingChat} />}
            {closed && (
              <div className="mx-auto rounded border-2 px-6 py-3 text-center text-slate-400">
                <div className="my-6 text-center">
                  <MessageCircleOff className="mx-auto mb-4 block" size={50} />
                  <span id={closedNoticeId}>{t.messages.closed}</span>
                </div>
                {/* Described by the notice, so focusing the button also says why a new conversation is needed */}
                <Button ref={startNewRef} variant="secondary" aria-describedby={closedNoticeId} onClick={() => setNewChatDlgOpen(true)}>
                  {t.messages.startNew}
                </Button>
                <NewConversation open={newChatDlgOpen} setOpen={setNewChatDlgOpen} />
              </div>
            )}
          </>
        )}
      </div>

      <ScrollButton ref={scrollButtonRef} visible={showScrollBtn} newResponse={newResponse} onClick={scrollToLatest} />
    </div>
  )
}
