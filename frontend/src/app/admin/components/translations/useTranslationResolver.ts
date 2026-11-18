"use client"

import { useCallback, useMemo, useRef } from "react"
import { zodResolver } from "@hookform/resolvers/zod"
import { DEFAULT_LANGUAGE, type Language } from "@lumi/shared-contracts/language"
import type { FieldValues, Resolver } from "react-hook-form"
import type { z } from "zod"

interface TranslationResolver<TValues extends FieldValues> {
  // For useForm: validates every field in English, and only the content in other languages
  resolver: Resolver<TValues>
  // Pass as useContentLanguage's onLanguageChange, so validation follows the language being edited
  setLanguage: (language: Language) => void
}

// Validation of a record form that edits content per language. Outside English the shared fields are read-only and the
// API ignores and doesn't check them, so only the content is validated (`contentSchema`, picked from the un-refined
// schema): a record whose shared data fails today's rules (e.g. a webpage without a protocol) can still be translated. A
// valid translation keeps the form's values as they are, shared fields included
export function useTranslationResolver<TValues extends FieldValues>(
  schema: z.ZodType<TValues, TValues>,
  contentSchema: z.ZodType<FieldValues, FieldValues>,
  initialLanguage: Language
): TranslationResolver<TValues> {
  // Read when the form validates, which never happens while rendering
  const languageRef = useRef(initialLanguage)

  const resolver = useMemo<Resolver<TValues>>(() => {
    const everyField = zodResolver(schema)
    // The content schema is picked from the form's, so its errors have the form's field paths
    const contentOnly = zodResolver(contentSchema) as unknown as Resolver<TValues>

    return async (values, context, options) => {
      if (languageRef.current === DEFAULT_LANGUAGE) return everyField(values, context, options)

      const result = await contentOnly(values, context, options)
      return Object.keys(result.errors).length ? result : { values, errors: {} }
    }
  }, [schema, contentSchema])

  const setLanguage = useCallback((language: Language) => {
    languageRef.current = language
  }, [])

  return { resolver, setLanguage }
}
