import type { ReactNode } from "react"
import { DEFAULT_LANGUAGE, type Language } from "@lumi/shared-contracts/language"

import { FormDescription } from "@/components/ui/form"

interface IProps {
  language: Language
  // The field's English text
  text: string | null | undefined
  // The field's own description, if any: a form field has a single description, so it joins the English text there
  children?: ReactNode
}

// The English text of a short field, under it while editing another language: to translate from, and what visitors read
// while the field is empty. Use inside a FormItem, after its FormControl. Shows only the field's own description, if any,
// in English or when English has no text
export default function EnglishText({ language, text, children }: IProps) {
  const english = language !== DEFAULT_LANGUAGE && text?.trim() ? text : undefined
  if (!english && !children) return null

  return (
    <FormDescription>
      {children}
      {english && (
        <span className="block break-words">
          English: <span lang={DEFAULT_LANGUAGE}>{english}</span>
        </span>
      )}
    </FormDescription>
  )
}
