import React from "react"
import { Sparkles, X } from "lucide-react"

import { launcherStrings } from "../../i18n"
import type { Language } from "../../i18n"
import LauncherButton from "./LauncherButton"

interface IProps {
  ref?: React.Ref<HTMLButtonElement>
  open: boolean
  onOpenChanged: (open: boolean) => void
  chatId: string
  className?: string
  style?: React.CSSProperties
  ctaText?: string
  language?: Language
  // Already resolved from the option and the installation's settings
  assistantName: string
}

export default function CtaLauncher({ ref, open, onOpenChanged, chatId, className, ctaText, language, assistantName, style = {} }: IProps) {
  const strings = launcherStrings(language, assistantName)

  return (
    <LauncherButton
      ref={ref}
      open={open}
      onOpenChanged={onOpenChanged}
      chatId={chatId}
      className={className}
      // The visible "Close" alone doesn't say what closes. The host's ctaText is in the host page's language, so the button
      // only takes the widget's language while it shows the widget's own text
      ariaLabel={open ? strings.closeChat : undefined}
      lang={open ? strings.lang : undefined}
      style={{ padding: "0 40px 0 20px", borderRadius: "25px", height: "35px", ...style }}
    >
      <span style={{ marginRight: 5 }}>{open ? strings.close : ctaText}</span>
      <X
        size="20"
        style={{
          position: "absolute",
          right: 13,
          bottom: 7,
          transition: "transform 0.16s linear, opacity 0.08s linear",
          opacity: open ? 1 : 0,
          transform: open ? "rotate(0)" : "rotate(-60deg)",
        }}
      />
      <Sparkles
        size="20"
        style={{
          position: "absolute",
          right: 13,
          bottom: 7,
          opacity: open ? 0 : 1,
          transform: open ? "scale(0)" : "scale(1)",
          transition: "transform 0.16s linear, opacity 0.08s linear",
        }}
      />
    </LauncherButton>
  )
}
