"use client"

import { useEffect, useRef, useState } from "react"
import { DEFAULT_LANGUAGE, LANGUAGES, type Language } from "@lumi/shared-contracts/language"
import type { FieldPath, FieldValues, PathValue, UseFormReturn } from "react-hook-form"

import { TRANSLATION_FAILED } from "@/lib/translationMessages"
import { toast } from "@/components/ui/use-toast"
import type { TranslateRequest, TranslateResponse } from "@/app/api/translate/route"

import { countOf, findTranslation, languageLabel, type FieldDescription } from "./languages"
import type { NestedReview } from "./useNestedReview"

// A content field the AI translation fills, with its saved text in the language translated from
export interface TranslatableField<TValues extends FieldValues> extends FieldDescription {
  // The form field it fills, e.g. "bio" or "experiences.2.position"
  name: FieldPath<TValues>
  text: string | null | undefined
  // Id of the nested item (an experience, a contribution) the field belongs to, which the form shows collapsed
  item?: string
}

// The described content fields of a form's values in a language (the form's valuesFor), which hold the language's saved
// text. Describe every content field, e.g. `satisfies Record<(typeof clientContentFields)[number], FieldDescription>`, so
// none is left untranslated. For a nested item's values, `path` places them in the form, e.g. "experiences.2", and `item`
// is its id
export function translatableFields<TValues extends FieldValues>(
  values: object,
  descriptions: Record<string, FieldDescription>,
  { path, item }: { path?: string; item?: string } = {}
): TranslatableField<TValues>[] {
  return Object.entries(descriptions).map(([field, description]) => ({
    ...description,
    name: (path ? `${path}.${field}` : field) as FieldPath<TValues>,
    text: (values as Record<string, unknown>)[field] as string | null | undefined,
    item,
  }))
}

interface Options<TValues extends FieldValues> {
  form: UseFormReturn<TValues>
  // Language being edited, which the translation fills. English is never translated into: it is the source every
  // translation is written from
  language: Language
  // The kind of record, for the model, e.g. "team member profile"
  record: string
  // The record's translations, to tell which languages have content to translate from
  translations: readonly { language: string }[] | null | undefined
  // The record's content fields in a language, with their saved text in it. Languages without a field's text leave it as
  // it is
  fieldsIn: (language: Language) => TranslatableField<TValues>[]
  // Name of the record's nested items, e.g. { singular: "experience", plural: "experiences" }, for the review reminder
  items?: { singular: string; plural: string }
  // Review of the nested items (useNestedReview), which flags those the translation fills
  review?: NestedReview
}

export interface AiTranslation {
  // Languages the record can be translated from into the one being edited: English, and any other language it has
  sources: Language[]
  // Language being translated from, while a translation runs
  pending: Language | null
  translateFrom: (language: Language) => Promise<void>
  // Restores the text the translations replaced since the language was picked or last undone, until the language
  // changes. Fields edited since keep the edits
  undo: (() => void) | null
}

// Translates a record's content with AI into the language being edited, from the saved text of another language. The
// translation fills the form for review, keeping the wording of the text already there where it still matches; nothing
// is saved until the team saves the form. Pass the result to AiTranslateButton
export function useAiTranslation<TValues extends FieldValues>({
  form,
  language,
  record,
  translations,
  fieldsIn,
  items,
  review,
}: Options<TValues>): AiTranslation {
  const [pending, setPending] = useState<Language | null>(null)
  const [undoable, setUndoable] = useState(false)
  const requestRef = useRef<AbortController | null>(null)
  // Each field the translations replaced: the text it held before them, and the translation it was filled with
  const replacedRef = useRef(new Map<FieldPath<TValues>, { before: unknown; translation: string }>())

  // Switching language or leaving the form stops a running translation, so it never fills another language, and ends
  // what applied to the language left
  useEffect(
    () => () => {
      requestRef.current?.abort()
      requestRef.current = null
      setPending(null)
      setUndoable(false)
      replacedRef.current = new Map()
    },
    [language]
  )

  const sources =
    language === DEFAULT_LANGUAGE
      ? []
      : LANGUAGES.filter((option) => option !== language && (option === DEFAULT_LANGUAGE || findTranslation(translations, option)))

  // Sets the fields, then validates them in one pass rather than one full-form validation per field
  function setFields(values: [FieldPath<TValues>, unknown][]) {
    values.forEach(([name, value]) => form.setValue(name, value as PathValue<TValues, FieldPath<TValues>>, { shouldDirty: true }))
    if (values.length > 0) void form.trigger(values.map(([name]) => name))
  }

  async function translateFrom(from: Language) {
    const fields = fieldsIn(from).filter((field) => field.text?.trim())
    if (!fields.length) {
      toast({ title: "Nothing to translate", description: `This record has no ${languageLabel(from)} text yet.` })
      return
    }

    const controller = new AbortController()
    requestRef.current = controller
    setPending(from)
    // The API's own message when it reports one; network errors read as a failed translation
    let failure = TRANSLATION_FAILED
    // The fields' text when the request was sent: a field edited while it runs keeps the newer text
    const sent = fields.map((field) => (form.getValues(field.name) as string | null | undefined) ?? "")

    try {
      const request: TranslateRequest = {
        record,
        from,
        to: language,
        fields: fields.map((field, index) => ({
          label: field.label,
          markdown: Boolean(field.markdown),
          text: field.text!,
          current: sent[index] || undefined,
        })),
      }
      const response = await fetch("/api/translate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(request),
        signal: controller.signal,
      })
      const body = (await response.json().catch(() => undefined)) as TranslateResponse | undefined
      if (!response.ok || !body || "error" in body) {
        if (body && "error" in body) failure = body.error
        throw new Error(failure)
      }

      // Fills the fields left as they were sent with a translation that isn't empty
      let editedMeanwhile = 0
      let untranslated = 0
      const translated: [FieldPath<TValues>, string][] = []
      const filled = new Set<string>()
      fields.forEach((field, index) => {
        const translation = body.translations[index]?.trim()
        const value = form.getValues(field.name)
        if ((value ?? "") !== sent[index]) {
          editedMeanwhile++
          return
        }
        if (!translation) {
          untranslated++
          return
        }
        // A field a previous translation filled, and left as it was, keeps the text from before that one
        const previous = replacedRef.current.get(field.name)
        replacedRef.current.set(field.name, { before: previous && value === previous.translation ? previous.before : value, translation })
        translated.push([field.name, translation])
        if (field.item) filled.add(field.item)
      })
      setFields(translated)

      if (replacedRef.current.size > 0) setUndoable(true)
      review?.addAiTranslated(filled)

      const target = languageLabel(language)
      const notes = [
        !items || filled.size === 0
          ? `Review the ${target} text, then save the translation to keep it.`
          : filled.size === 1
            ? `Review the ${target} text, then save. Open the ${items.singular} marked AI-translated: it isn't saved until you do.`
            : `Review the ${target} text, then save. Open each of the ${filled.size} ${items.plural} marked AI-translated: unopened ones aren't saved.`,
        editedMeanwhile > 0 && `${countOf(editedMeanwhile, "field you edited meanwhile", "fields you edited meanwhile")} kept your text.`,
        untranslated > 0 &&
          (untranslated === 1
            ? "The AI returned nothing for 1 field, so it wasn't changed."
            : `The AI returned nothing for ${untranslated} fields, so they weren't changed.`),
      ]
      // Longer than the default, as the toast says what to do next
      toast({ title: `Translated from ${languageLabel(from)}`, description: notes.filter(Boolean).join(" "), duration: 10_000 })
    } catch (e) {
      if (controller.signal.aborted) return
      console.error("Error translating record", e)
      toast({ variant: "destructive", title: "Couldn't translate", description: failure })
    } finally {
      if (requestRef.current === controller) {
        requestRef.current = null
        setPending(null)
      }
    }
  }

  function undo() {
    let kept = 0
    const restored: [FieldPath<TValues>, unknown][] = []
    replacedRef.current.forEach(({ before, translation }, name) => {
      if ((form.getValues(name) ?? "") === translation) {
        restored.push([name, before])
      } else {
        kept++
      }
    })
    setFields(restored)
    replacedRef.current = new Map()
    setUndoable(false)
    review?.clearAiTranslated()
    toast({
      title: "Translation undone",
      description: kept > 0 ? `${countOf(kept, "field you edited since keeps", "fields you edited since keep")} your changes.` : undefined,
    })
  }

  return { sources, pending, translateFrom, undo: undoable ? undo : null }
}
