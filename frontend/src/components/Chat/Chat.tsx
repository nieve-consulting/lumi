"use client"

import { useCallback, useRef } from "react"

import { useBusiness } from "@/lib/BusinessProvider"
import { useI18n } from "@/lib/i18n/LanguageProvider"
import { cn } from "@/lib/utils"

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
}

// The chat page itself, e.g. with the campaign a link to it carries
const currentPageUrl = async () => window.location.href

export default function Chat({ className, version, commitId }: IProps) {
  const { t } = useI18n()
  const { contact } = useBusiness()
  const promptRef = useRef<PromptHandle>(null)
  const startNewRef = useRef<HTMLButtonElement>(null)
  const composerRef = useRef<HTMLDivElement>(null)
  const { closed, isCreatingThread } = useChatStore()
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
  } = useLumiChat({ currentPageUrl })

  // A conversation that closes while the visitor writes, e.g. at its message limit, disables the message box under them, so
  // focus goes to the closed notice's "Start new conversation" button
  const focusStartNew = useCallback(() => startNewRef.current?.focus(), [])
  useFocusOnClose({ closed, loadingThread, composerRef, focusClosed: focusStartNew })

  return (
    <div className={cn(className, "flex flex-col border border-slate-200 bg-white p-2 shadow-md")}>
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
        closed={closed}
        isCreatingThread={isCreatingThread}
      />
      <div className="mb-2 text-center text-xs text-slate-400">
        {t.disclaimer.publicBefore}
        {contact ? (
          <a className="underline" href={contact}>
            {t.disclaimer.link}
          </a>
        ) : (
          t.disclaimer.link
        )}
        {t.disclaimer.after}
      </div>
      <div ref={composerRef} className="flex items-end gap-2">
        <Menu version={version} commitId={commitId} />
        <Prompt
          ref={promptRef}
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
