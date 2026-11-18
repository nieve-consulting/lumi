"use client"

import { useState } from "react"
import type { Language } from "@lumi/shared-contracts/language"

// What the team has reviewed of a record's nested items (a team member's experiences, a project's contributions), by id
export interface NestedReview {
  // Call when an item is opened or closed. Opening it reviews it in the language being edited
  onOpenChange: (item: string, open: boolean) => void
  // Whether the item was opened in the language being edited
  isOpened: (item: string) => boolean
  // Whether the AI translation filled the item and nobody has opened it since
  isAiTranslated: (item: string) => boolean
  // How many items the AI translation filled that nobody has opened since, which a translation save leaves out
  aiTranslatedCount: number
  // Flags items an AI translation filled, until they are opened. Items open meanwhile are reviewed as they fill
  addAiTranslated: (items: ReadonlySet<string>) => void
  // Clears the flags, when the AI translations are undone
  clearAiTranslated: () => void
}

const NO_ITEMS: ReadonlySet<string> = new Set()

// The language's items open now and those flagged as AI-translated
interface LanguageState {
  language: Language
  open: ReadonlySet<string>
  aiTranslated: ReadonlySet<string>
}

const without = (items: ReadonlySet<string>, item: string) => {
  if (!items.has(item)) return items
  const next = new Set(items)
  next.delete(item)
  return next
}

// Review of a record's nested items in the language being edited, the one place the forms, their item lists and
// useAiTranslation read and record it. Items opened are kept per language (`language:id`); the items open now and the AI
// translation's flags apply to the language they were set in, as switching language resets the form to the saved content
// and collapses its items
export function useNestedReview(language: Language): NestedReview {
  const [opened, setOpened] = useState<ReadonlySet<string>>(NO_ITEMS)
  const [state, setState] = useState<LanguageState>({ language, open: NO_ITEMS, aiTranslated: NO_ITEMS })
  const current = state.language === language ? state : { language, open: NO_ITEMS, aiTranslated: NO_ITEMS }

  const update = (change: (current: LanguageState) => LanguageState) =>
    setState((state) => change(state.language === language ? state : { language, open: NO_ITEMS, aiTranslated: NO_ITEMS }))

  function onOpenChange(item: string, open: boolean) {
    if (open) {
      setOpened((opened) => new Set(opened).add(`${language}:${item}`))
      update((current) => ({ ...current, open: new Set(current.open).add(item), aiTranslated: without(current.aiTranslated, item) }))
    } else {
      update((current) => ({ ...current, open: without(current.open, item) }))
    }
  }

  function addAiTranslated(items: ReadonlySet<string>) {
    update((current) => ({
      ...current,
      aiTranslated: new Set([...current.aiTranslated, ...[...items].filter((item) => !current.open.has(item))]),
    }))
  }

  return {
    onOpenChange,
    isOpened: (item) => opened.has(`${language}:${item}`),
    isAiTranslated: (item) => current.aiTranslated.has(item),
    aiTranslatedCount: current.aiTranslated.size,
    addAiTranslated,
    clearAiTranslated: () => update((current) => ({ ...current, aiTranslated: NO_ITEMS })),
  }
}
