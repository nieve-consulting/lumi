"use client"

import { useRef, useState } from "react"

import type { FieldErrors } from "@/components/BusinessSettings/form"

// A settings form's draft and the problems shown with it. update merges a change into the draft as last changed rather than as
// last rendered, so a change that lands later, e.g. a logo upload finishing after the admin edited other fields, keeps their
// edits. Problems already shown clear as they're fixed
export function useFormDraft<T extends object>(initial: () => T, validate: (form: T) => FieldErrors) {
  const [form, setDraft] = useState(initial)
  const [errors, setErrors] = useState<FieldErrors>({})
  const latest = useRef(form)

  function setForm(next: T) {
    latest.current = next
    setDraft(next)
  }

  function update(patch: Partial<T>) {
    const next = { ...latest.current, ...patch }
    setForm(next)
    setErrors((shown) =>
      Object.keys(shown).length ? Object.fromEntries(Object.entries(validate(next)).filter(([field]) => field in shown)) : shown
    )
  }

  return { form, setForm, update, errors, setErrors }
}
