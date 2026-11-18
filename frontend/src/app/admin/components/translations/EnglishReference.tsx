import { DEFAULT_LANGUAGE, type Language } from "@lumi/shared-contracts/language"

import { cn } from "@/lib/utils"

interface IProps {
  language: Language
  // The field's English text
  text: string | null | undefined
  className?: string
}

// The English text of a long (markdown) field, collapsed under it while editing another language, to translate from and
// as what visitors read while the field is empty. Renders nothing in English or when English has no text
export default function EnglishReference({ language, text, className }: IProps) {
  if (language === DEFAULT_LANGUAGE || !text?.trim()) return null

  return (
    <details className={cn("text-sm text-slate-500", className)}>
      <summary className="w-max cursor-pointer select-none hover:text-slate-700">English text</summary>
      <div className="mt-2 max-h-60 overflow-y-auto rounded-md border border-slate-200 bg-slate-50 p-3 whitespace-pre-wrap" lang={DEFAULT_LANGUAGE}>
        {text}
      </div>
    </details>
  )
}
