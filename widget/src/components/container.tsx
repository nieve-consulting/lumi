import React, { useEffect, useMemo, useRef, useState } from "react"

import { baseLanguage, launcherStrings } from "../i18n"
import type { Language } from "../i18n"
import ChatSkeleton from "./ChatSkeleton"

interface IProps {
  id: string
  // The Lumi installation's origin, already resolved: the chat page loads from it and only its messages are trusted
  origin: string
  open: boolean
  // Changes with each request to open the chat, including while it's open
  focusRequest: number
  onClose: () => void
  pageTile?: string
  isBubble?: boolean
  // The language option, which the chat opens in unless the visitor picked another
  initialLanguage?: Language
  // The language the chat shows, for the iframe's title
  language?: Language
  onLanguageChange: (language: Language) => void
  // Already resolved from the option and the installation's settings
  assistantName: string
}

export default function Container({
  id,
  origin,
  open,
  focusRequest,
  onClose,
  pageTile,
  isBubble,
  initialLanguage,
  language,
  onLanguageChange,
  assistantName,
}: IProps) {
  const strings = launcherStrings(language, assistantName)
  const [loadiFrame, setLoadiFrame] = useState(false)
  // Whether the chat page shows yet: it reports CHAT_READY once it runs, and the iframe's load event stands in for pages
  // that never do, such as an error page or an installation older than the report
  const [chatShown, setChatShown] = useState(false)
  const iframeRef = useRef<HTMLIFrameElement>(null)
  const url = useMemo(() => {
    const url = new URL("/widget", origin)

    if (pageTile) {
      url.searchParams.append("initialPageTitle", pageTile)
    }

    if (initialLanguage) {
      url.searchParams.append("language", initialLanguage)
    }

    return url.toString()
    // We only need to update the URL the first time loadiFrame is set to true, not when pageTitle or the language changes.
    // The origin is fixed when the widget mounts
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loadiFrame])

  // Load the iframe the first time the widget opens and keep it loaded afterwards
  if (open && !loadiFrame) {
    setLoadiFrame(true)
  }

  useEffect(() => {
    // Send message to iframe when `pageTile` changes
    if (loadiFrame && pageTile && iframeRef.current) {
      iframeRef.current.contentWindow?.postMessage({ type: "UPDATE_PAGE_TITLE", pageTitle: pageTile }, origin)
    }
  }, [pageTile, loadiFrame, origin])

  // Move focus into the chat when it opens, or is asked to open again while open, and ask the chat page to focus its message
  // box. Until the page has loaded, the target origin drops the request; the page then reports CHAT_READY and is asked again
  useEffect(() => {
    const iframe = iframeRef.current
    if (!open || !iframe) return

    iframe.focus()
    iframe.contentWindow?.postMessage({ type: "FOCUS_PROMPT" }, origin)
  }, [open, focusRequest, origin])

  // The chat page reports when it's ready for focus requests and asks to close when the visitor presses Escape in it. Focus
  // is only requested while it's still on the chat, as the visitor may have moved on to the page while the chat loaded. It
  // also reports its language once loaded and whenever the visitor switches it, so the launcher and the title follow. When a
  // conversation starts it asks which page it's on, which it records filtered: the URL only goes to the chat page's origin
  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      const iframe = iframeRef.current
      if (event.origin !== origin || !iframe || event.source !== iframe.contentWindow) return
      if (event.data?.type === "CHAT_READY") {
        setChatShown(true)
        if (open && document.activeElement === iframe) iframe.contentWindow?.postMessage({ type: "FOCUS_PROMPT" }, origin)
      }
      if (event.data?.type === "CLOSE_CHAT") onClose()
      if (event.data?.type === "REQUEST_PAGE_URL") {
        iframe.contentWindow?.postMessage({ type: "PAGE_URL", pageUrl: window.location.href }, origin)
      }
      if (event.data?.type === "CHAT_LANGUAGE") {
        const language = baseLanguage(event.data.language)
        if (language) onLanguageChange(language)
      }
    }

    window.addEventListener("message", handleMessage)

    return () => {
      window.removeEventListener("message", handleMessage)
    }
  }, [open, onClose, onLanguageChange, origin])

  return (
    <div
      id={id}
      style={{
        zIndex: 2147483000,
        position: "fixed",
        bottom: isBubble ? 95 : 70,
        right: 20,
        transformOrigin: "right bottom",
        visibility: open ? "visible" : "hidden",
        height: "min(704px, 100% - 104px)",
        minHeight: 80,
        width: 500,
        maxWidth: "90%",
        maxHeight: 704,
        borderRadius: 16,
        overflow: "hidden",
        boxShadow: "rgba(0, 0, 0, 0.16) 0px 5px 40px",
        opacity: open ? 1 : 0,
        transition: "width 200ms, height 200ms, max-height 200ms, transform 300ms cubic-bezier(0, 1.2, 1, 1), opacity 83ms ease-out",
        pointerEvents: open ? "all" : "none",
        transform: open ? "scale(1)" : "scale(0)",
      }}
    >
      {loadiFrame ? (
        <iframe
          ref={iframeRef}
          src={url}
          title={strings.chatTitle}
          lang={strings.lang}
          onLoad={() => setChatShown(true)}
          style={{ width: "100%", height: "100%", border: "none", backgroundColor: "white" }}
        />
      ) : (
        <div style={{ width: "100%", height: "100%", backgroundColor: "white" }} />
      )}
      <ChatSkeleton visible={!chatShown} />
      {/* Says what the placeholder shows, as focus moves into the still empty iframe. Kept in place so the text it gets
          is announced, and visually hidden rather than undisplayed, which would silence it */}
      <div
        role="status"
        style={{
          position: "absolute",
          width: 1,
          height: 1,
          margin: -1,
          padding: 0,
          border: 0,
          overflow: "hidden",
          clip: "rect(0 0 0 0)",
          whiteSpace: "nowrap",
        }}
      >
        {open && !chatShown ? strings.loadingChat : ""}
      </div>
    </div>
  )
}
