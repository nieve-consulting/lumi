import { Languages } from "lucide-react"

import { cn } from "@/lib/utils"

import { languageLabel, TRANSLATION_LANGUAGES } from "./languages"

// The languages content can be translated into, e.g. "Spanish", or "Spanish or French"
const translationNames = new Intl.ListFormat("en", { type: "disjunction" }).format(TRANSLATION_LANGUAGES.map(languageLabel))

interface IProps {
  className?: string
}

// Stands in for LanguageSwitcher on a form whose record has no English content saved yet (a new record, or the company
// before its English is saved): translations are written from English, so English comes first
export default function EnglishFirstNote({ className }: IProps) {
  return (
    <p className={cn("flex items-start gap-2 text-sm text-slate-500", className)}>
      <Languages size={16} className="mt-0.5 shrink-0" aria-hidden />
      <span>Write in English first. Once it&apos;s saved, you can add a {translationNames} translation or have AI draft one.</span>
    </p>
  )
}
