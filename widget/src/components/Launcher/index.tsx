import React, { useEffect } from "react"

import type { Language } from "../../i18n"
import BubbleLauncher from "./BubbleLauncher"
import CtaLauncher from "./CtaLAuncher"

interface IProps {
  ref?: React.Ref<HTMLButtonElement>
  open: boolean
  onOpenChanged: (open: boolean) => void
  iconSize: number
  chatId: string
  className?: string
  style?: React.CSSProperties
  ctaText?: string
  language?: Language
  // Already resolved from the option and the installation's settings
  assistantName: string
}

export default function Launcher({ ref, open, onOpenChanged, iconSize, chatId, className, ctaText, language, assistantName, style = {} }: IProps) {
  useEffect(() => {
    const handleClick = (event: MouseEvent) => {
      // The click can land on an element inside the link, such as its text or icon
      const anchor = event.target instanceof Element ? event.target.closest('a[href="#open-lumi"]') : null
      if (anchor) {
        event.preventDefault() // optional, only if you don't want default anchor behavior
        onOpenChanged(true)
      }
    }

    document.addEventListener("click", handleClick)

    return () => {
      document.removeEventListener("click", handleClick)
    }
  }, [onOpenChanged])

  return ctaText ? (
    <CtaLauncher
      ref={ref}
      open={open}
      onOpenChanged={onOpenChanged}
      chatId={chatId}
      className={className}
      style={style}
      ctaText={ctaText}
      language={language}
      assistantName={assistantName}
    />
  ) : (
    <BubbleLauncher
      ref={ref}
      open={open}
      onOpenChanged={onOpenChanged}
      iconSize={iconSize}
      chatId={chatId}
      className={className}
      style={style}
      language={language}
      assistantName={assistantName}
    />
  )
}
