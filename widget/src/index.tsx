import React from "react"
import { createRoot } from "react-dom/client"

import { resolveLumiOrigin } from "./config"
import Widget from "./widget"

export interface InitProps {
  selector: string
  // The Lumi installation to connect to, such as https://lumi.example.com. When missing: the LUMI_WIDGET_ORIGIN it was built
  // with, else the origin this bundle was loaded from, else http://localhost:8080 in development
  origin?: string
  // The assistant's name in the launcher's labels and the chat's title; the installation's when missing
  assistantName?: string
  iconSize?: number
  // The launcher's colours. When both and className are missing and the installation has a primary colour, white on it
  color?: string
  backgroundColor?: string
  pageTitle?: string
  className?: string
  ctaText?: string
  // A BCP 47 tag such as es or es-MX. When missing or unsupported, the chat picks its language as on its own page, falling
  // back to the installation's default, and so do the launcher's labels
  language?: string
}

export const init = ({ selector, origin, assistantName, iconSize, color, backgroundColor, className, pageTitle, ctaText, language }: InitProps) => {
  // Resolved before rendering, so a widget with no installation to connect to shows nothing and logs only the reason
  const resolved = resolveLumiOrigin(origin)
  if ("error" in resolved) {
    console.error(resolved.error)
    return
  }

  const container = document.getElementById(selector)
  if (container) {
    // The prefix keeps the widget's ids apart from those of a host page that also uses React
    const root = createRoot(container, { identifierPrefix: "lumi-" })
    root.render(
      <Widget
        origin={resolved.origin}
        assistantName={assistantName}
        iconSize={iconSize}
        pageTitle={pageTitle}
        className={className}
        style={{ color, backgroundColor }}
        ctaText={ctaText}
        language={language}
      />
    )
  } else {
    console.error(`Element with selector ${selector} not found`)
  }
}
