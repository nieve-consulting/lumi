"use client"

import { useRef } from "react"
import { LoaderCircle, Sparkles, Undo2 } from "lucide-react"

import { Button } from "@/components/ui/button"

import { languageLabel } from "./languages"
import type { AiTranslation } from "./useAiTranslation"

interface IProps {
  // Result of useAiTranslation
  control: AiTranslation
}

// "Translate from English" (and from any other language the record has) while editing a translation, then "Undo
// translation" until the language changes. Renders nothing in English. Place it in LanguageSwitcher, next to the languages
export default function AiTranslateButton({ control }: IProps) {
  const { sources, pending, translateFrom, undo } = control
  const firstSourceRef = useRef<HTMLButtonElement>(null)

  // Undo removes its own button: focus moves to the translate button rather than being lost
  function onUndo() {
    undo?.()
    firstSourceRef.current?.focus()
  }

  return (
    <>
      {sources.map((source, index) => (
        // aria-disabled rather than disabled while translating, so the button keeps focus
        <Button
          key={source}
          ref={index === 0 ? firstSourceRef : undefined}
          type="button"
          variant="secondary"
          size="sm"
          aria-disabled={pending !== null}
          className="aria-disabled:opacity-50"
          onClick={() => pending === null && translateFrom(source)}
        >
          {pending === source ? <LoaderCircle className="animate-spin" aria-hidden /> : <Sparkles aria-hidden />}
          {pending === source ? `Translating from ${languageLabel(source)}...` : `Translate from ${languageLabel(source)}`}
        </Button>
      ))}
      {undo && pending === null && (
        <Button type="button" variant="ghost" size="sm" onClick={onUndo}>
          <Undo2 aria-hidden />
          Undo translation
        </Button>
      )}
      {/* Says what to expect while a translation runs, and announces it started; the toast announces how it ended. Always
          rendered, so screen readers notice the change */}
      <span role="status" className="text-sm text-slate-500">
        {pending && (
          <>
            <span className="sr-only">Translating from {languageLabel(pending)}... </span>
            This can take a minute. Fields you edit meanwhile keep your text.
          </>
        )}
      </span>
    </>
  )
}
