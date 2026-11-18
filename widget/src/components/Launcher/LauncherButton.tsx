import React, { useState } from "react"

interface IProps {
  ref?: React.Ref<HTMLButtonElement>
  open: boolean
  onOpenChanged: (open: boolean) => void
  chatId: string
  className?: string
  ariaLabel?: string
  // The language of the button's own text, which may differ from the host page's
  lang?: string
  style: React.CSSProperties
  children: React.ReactNode
}

// The button both launchers share: it toggles the chat, reports its state and reacts to hover and presses
export default function LauncherButton({ ref, open, onOpenChanged, chatId, className, ariaLabel, lang, style, children }: IProps) {
  const [hover, setHover] = useState(false)
  const [pressed, setPressed] = useState(false)

  return (
    <button
      ref={ref}
      type="button"
      className={className ? `lumi-launcher ${className}` : "lumi-launcher lumi-launcher-default"}
      aria-label={ariaLabel}
      lang={lang}
      aria-expanded={open}
      aria-controls={chatId}
      style={{
        position: "fixed",
        bottom: 20,
        right: 20,
        margin: 0,
        // Transparent, but drawn in forced colors mode, which drops the background
        border: "1px solid transparent",
        display: "flex",
        justifyContent: "center",
        alignItems: "center",
        cursor: "pointer",
        boxShadow: "rgba(0, 0, 0, 0.16) 0px 5px 40px",
        transition: "transform 0.16s linear",
        transform: pressed ? "scale(0.8)" : hover ? "scale(1.1)" : "scale(1)",
        ...style,
      }}
      onClick={() => onOpenChanged(!open)}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => {
        setHover(false)
        setPressed(false)
      }}
      onMouseDown={() => setPressed(true)}
      onMouseUp={() => setPressed(false)}
    >
      {children}
    </button>
  )
}
