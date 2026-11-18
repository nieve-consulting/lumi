import React from "react"
import { Sparkles, X } from "lucide-react"

import { launcherStrings } from "../../i18n"
import type { Language } from "../../i18n"
import LauncherButton from "./LauncherButton"

interface IProps {
  ref?: React.Ref<HTMLButtonElement>
  open: boolean
  onOpenChanged: (open: boolean) => void
  iconSize: number
  chatId: string
  className?: string
  style?: React.CSSProperties
  language?: Language
  // Already resolved from the option and the installation's settings
  assistantName: string
}

export default function BubbleLauncher({ ref, open, onOpenChanged, iconSize, chatId, className, language, assistantName, style = {} }: IProps) {
  const strings = launcherStrings(language, assistantName)

  return (
    <LauncherButton
      ref={ref}
      open={open}
      onOpenChanged={onOpenChanged}
      chatId={chatId}
      className={className}
      // A fixed name: aria-expanded tells whether the chat is open
      ariaLabel={strings.openChat}
      lang={strings.lang}
      style={{ padding: 0, borderRadius: "50%", width: iconSize, height: iconSize, ...style }}
    >
      <X
        size={iconSize / 2}
        style={{
          position: "absolute",
          transition: "transform 0.16s linear, opacity 0.08s linear",
          opacity: open ? 1 : 0,
          transform: open ? "rotate(0)" : "rotate(-60deg)",
        }}
      />
      <Sparkles
        size={iconSize / 2}
        style={{
          position: "absolute",
          opacity: open ? 0 : 1,
          transform: open ? "scale(0)" : "scale(1)",
          transition: "transform 0.16s linear, opacity 0.08s linear",
        }}
      />
    </LauncherButton>
  )
}
