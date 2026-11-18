import React, { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from "react"

import { DEFAULT_BUSINESS, fetchBusiness, type WidgetBusiness } from "./business"
import Container from "./components/container"
import Launcher from "./components/Launcher"
import { resolveLumiOrigin } from "./config"
import { baseLanguage, labelLanguage, type Language } from "./i18n"
import { applyLauncherStyles } from "./launcherStyles"

export interface WidgetProps {
  // The Lumi installation to connect to, such as https://lumi.example.com. Read when the widget mounts; when missing, the
  // LUMI_WIDGET_ORIGIN the widget was built with, or http://localhost:8080 in development
  origin?: string
  // The assistant's name in the launcher's labels and the chat's title; the installation's when missing
  assistantName?: string
  iconSize?: number
  pageTitle?: string
  className?: string
  style?: React.CSSProperties
  ctaText?: string
  // A BCP 47 tag such as es or es-MX. When missing or unsupported, the chat picks its language as on its own page, falling
  // back to the installation's default, and so do the launcher's labels
  language?: string
}

// The launcher's colours: the host's, or white on the installation's primary colour when the host sets neither colour nor
// a class, whose own colours the inline default would override
function launcherStyle(style: React.CSSProperties | undefined, className: string | undefined, primaryColor: string | undefined) {
  const hostColours = style && [style.color, style.backgroundColor, style.background].some((value) => value !== undefined)
  if (hostColours || className || !primaryColor) return style
  return { ...style, color: "#ffffff", backgroundColor: primaryColor }
}

// Connects to the Lumi installation the origin option or the build names, and renders nothing but a console error when there
// is none or the option isn't a valid origin. It then asks the installation for its settings and shows the launcher once it
// answers: with its settings; with neutral ones when it can't be reached in time or answers something unexpected; or not
// at all while the installation isn't set up yet or the origin isn't a Lumi installation
export default function Widget({ origin: originOption, ...props }: WidgetProps) {
  const [resolved] = useState(() => resolveLumiOrigin(originOption))
  const origin = "origin" in resolved ? resolved.origin : undefined
  const error = "error" in resolved ? resolved.error : undefined
  // Undefined while the installation is asked, null when it isn't set up or isn't a Lumi installation
  const [business, setBusiness] = useState<WidgetBusiness | null>()

  useEffect(() => {
    if (error) console.error(error)
  }, [error])

  useEffect(() => {
    if (!origin) return
    const controller = new AbortController()
    fetchBusiness(origin, controller.signal).then((result) => {
      if (!result) return
      if (result.status === "configured") {
        setBusiness(result.business)
      } else if (result.status === "unconfigured") {
        console.info(`Lumi widget: the Lumi installation at ${origin} isn't set up yet, so the widget isn't shown. Finish its setup to show it.`)
        setBusiness(null)
      } else if (result.status === "notLumi") {
        console.error(
          `Lumi widget: ${origin} isn't a Lumi installation (it has no /api/business), so the widget isn't shown. ` +
            'Pass your installation\'s origin, as in LumiWidget.init({ selector, origin: "https://lumi.example.com" }).'
        )
        setBusiness(null)
      } else {
        console.warn(
          `Lumi widget: couldn't load the settings of the Lumi installation at ${origin}: ${result.reason}. ` +
            "The launcher shows default labels and colours. Check that the installation is reachable and that the page's " +
            `Content-Security-Policy allows connect-src ${origin}.`
        )
        setBusiness(DEFAULT_BUSINESS)
      }
    })
    return () => controller.abort()
  }, [origin])

  return origin && business ? <ConnectedWidget origin={origin} business={business} {...props} /> : null
}

interface ConnectedWidgetProps extends Omit<WidgetProps, "origin"> {
  origin: string
  business: WidgetBusiness
}

function ConnectedWidget({
  origin,
  business,
  assistantName: assistantNameOption,
  iconSize = 60,
  pageTitle,
  className,
  style,
  ctaText,
  language: languageOption,
}: ConnectedWidgetProps) {
  const [open, setOpen] = useState(false)
  // Passed on to the chat, which shows it if it can and falls back to the installation's default language otherwise
  const initialLanguage = baseLanguage(languageOption)
  // The launcher follows the language option until the chat reports the one it shows, which may be the visitor's own
  // choice. Its labels fall back as the chat does (see launcherStrings)
  const [language, setLanguage] = useState<Language | undefined>(initialLanguage)
  const labelsLanguage = labelLanguage(language, business.defaultLanguage)
  const assistantName = assistantNameOption?.trim() || business.assistantName
  const chatId = useId()
  const launcherRef = useRef<HTMLButtonElement>(null)
  const openerRef = useRef<HTMLElement | null>(null)
  // Counts requests to open the chat, so one made while it's already open still moves focus into it
  const [focusRequest, setFocusRequest] = useState(0)

  // Remembers what had focus when the chat opened, such as a #open-lumi link elsewhere on the page. The chat's own iframe,
  // focused when a link is used while the chat is open, is never the opener
  const changeOpen = useCallback((nextOpen: boolean) => {
    const active = document.activeElement
    if (nextOpen && !(active instanceof HTMLIFrameElement)) {
      openerRef.current = active instanceof HTMLElement && active !== document.body ? active : null
    }
    if (nextOpen) setFocusRequest((count) => count + 1)
    setOpen(nextOpen)
  }, [])

  // Closing from inside the chat returns focus to what opened it, or else the launcher, as the hidden chat can't keep it.
  // Closing from the launcher, by click or Escape, leaves focus on the launcher
  const closeChat = useCallback(() => {
    setOpen(false)
    // The chat closes with Escape, so the focus ring shows even if the page last saw a click. The opener may be gone or unable
    // to take focus, e.g. a link in a menu that collapsed
    const opener = openerRef.current
    opener?.focus({ focusVisible: true })
    if (!opener || document.activeElement !== opener) launcherRef.current?.focus({ focusVisible: true })
  }, [])

  // Before the first paint, so the launcher never shows with the browser's button styles
  useLayoutEffect(applyLauncherStyles, [])

  return (
    // Escape on the launcher closes the chat too, like a click; inside the chat the iframe page asks to close instead, as its
    // key events don't reach this page
    <div
      style={{ padding: 10, textAlign: "center" }}
      onKeyDown={(event) => {
        if (open && event.key === "Escape" && !event.defaultPrevented) changeOpen(false)
      }}
    >
      <Launcher
        ref={launcherRef}
        open={open}
        onOpenChanged={changeOpen}
        iconSize={iconSize}
        chatId={chatId}
        className={className}
        style={launcherStyle(style, className, business.primaryColor)}
        ctaText={ctaText}
        language={labelsLanguage}
        assistantName={assistantName}
      />
      <Container
        id={chatId}
        origin={origin}
        open={open}
        focusRequest={focusRequest}
        onClose={closeChat}
        pageTile={pageTitle}
        isBubble={!ctaText}
        initialLanguage={initialLanguage}
        language={labelsLanguage}
        onLanguageChange={setLanguage}
        assistantName={assistantName}
      />
    </div>
  )
}
