"use client"

import { useState } from "react"
import type { Language } from "@lumi/shared-contracts/language"
import { useForm, type DefaultValues, type FieldValues } from "react-hook-form"
import type { z } from "zod"

import { useContentLanguage } from "./useContentLanguage"
import { useTranslationResolver } from "./useTranslationResolver"

interface Options<TValues extends FieldValues> {
  // Every field's rules, applied in English
  schema: z.ZodType<TValues, TValues>
  // The content's rules, applied in other languages (useTranslationResolver)
  contentSchema: z.ZodType<FieldValues, FieldValues>
  // Language the form opens in
  initialLanguage: Language
  // The form's values in a language: the record's shared fields plus that language's content (contentValues). Memoize it
  valuesFor: (language: Language) => TValues
  // Keep the language in the URL (useContentLanguage). Off for forms outside a page of their own, such as a modal
  syncUrl?: boolean
}

// A record form that edits content per language: the form, validated for the language being edited, and the language it
// edits, which switching resets the form to. Pass `contentLanguage` to LanguageSwitcher. Outside English only the content
// is edited (`translating`): the fields every language shares are read-only
export function useTranslatableForm<TValues extends FieldValues>({ schema, contentSchema, initialLanguage, valuesFor, syncUrl }: Options<TValues>) {
  const { resolver, setLanguage } = useTranslationResolver(schema, contentSchema, initialLanguage)
  // The form reads its default values once, so they are built once rather than on every render
  const [defaultValues] = useState(() => valuesFor(initialLanguage) as DefaultValues<TValues>)
  const form = useForm<TValues>({
    resolver,
    defaultValues,
    mode: "onChange",
  })
  const contentLanguage = useContentLanguage({ form, initialLanguage, valuesFor, syncUrl, onLanguageChange: setLanguage })

  return { form, contentLanguage, language: contentLanguage.language, translating: !contentLanguage.isDefaultLanguage }
}
