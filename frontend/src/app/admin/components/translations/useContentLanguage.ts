"use client"

import { useCallback, useState } from "react"
import { DEFAULT_LANGUAGE, LANGUAGE_PARAM, type Language } from "@lumi/shared-contracts/language"
import { useFormState, type FieldValues, type UseFormReturn } from "react-hook-form"

interface Options<TValues extends FieldValues> {
  form: UseFormReturn<TValues>
  // Language the form opens in, e.g. parseLanguage of the page's ?language= parameter. The form's default values must be
  // this language's
  initialLanguage?: Language
  // The form's values in a language: the record's shared fields plus that language's content (contentValues)
  valuesFor: (language: Language) => TValues
  // Keep the language in the URL's ?language= parameter, so it survives a reload. Off for forms outside a page of their
  // own, such as a modal
  syncUrl?: boolean
  // Called with the language switched to, before the form resets to its values, e.g. useTranslationResolver's setLanguage
  onLanguageChange?: (language: Language) => void
}

export interface ContentLanguage {
  // Language being edited
  language: Language
  // English, where every field is editable; other languages only edit translatable content
  isDefaultLanguage: boolean
  // Switches to the language, first asking to discard unsaved changes (see LanguageSwitcher, which shows that dialog)
  requestLanguage: (language: Language) => void
  // Language waiting for the user to discard unsaved changes, if any
  pendingLanguage: Language | null
  confirmPendingLanguage: () => void
  cancelPendingLanguage: () => void
}

function replaceLanguageParam(language: Language) {
  const url = new URL(window.location.href)
  if (language === DEFAULT_LANGUAGE) {
    url.searchParams.delete(LANGUAGE_PARAM)
  } else {
    url.searchParams.set(LANGUAGE_PARAM, language)
  }
  // Native history updates sync with Next's router without refetching the page or scrolling
  window.history.replaceState(null, "", url)
}

// The language a record form edits. Switching resets the form to that language's values, after confirming that unsaved
// changes are discarded. Pass the result to LanguageSwitcher and TranslationNotice
export function useContentLanguage<TValues extends FieldValues>({
  form,
  initialLanguage = DEFAULT_LANGUAGE,
  valuesFor,
  syncUrl = true,
  onLanguageChange,
}: Options<TValues>): ContentLanguage {
  const [language, setLanguage] = useState<Language>(initialLanguage)
  const [pendingLanguage, setPendingLanguage] = useState<Language | null>(null)
  // Subscribed while rendering, so the value is current when the user switches
  const { isDirty } = useFormState({ control: form.control })

  const switchTo = useCallback(
    (next: Language) => {
      setLanguage(next)
      onLanguageChange?.(next)
      form.reset(valuesFor(next))
      if (syncUrl) replaceLanguageParam(next)
    },
    [form, valuesFor, syncUrl, onLanguageChange]
  )

  const requestLanguage = useCallback(
    (next: Language) => {
      if (next === language) return
      if (isDirty) {
        setPendingLanguage(next)
      } else {
        switchTo(next)
      }
    },
    [language, isDirty, switchTo]
  )

  const confirmPendingLanguage = useCallback(() => {
    if (pendingLanguage) switchTo(pendingLanguage)
    setPendingLanguage(null)
  }, [pendingLanguage, switchTo])

  const cancelPendingLanguage = useCallback(() => setPendingLanguage(null), [])

  return {
    language,
    isDefaultLanguage: language === DEFAULT_LANGUAGE,
    requestLanguage,
    pendingLanguage,
    confirmPendingLanguage,
    cancelPendingLanguage,
  }
}
