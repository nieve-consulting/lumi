"use client"

import { useId, type ReactNode } from "react"
import { DEFAULT_LANGUAGE, LANGUAGE_NAMES, LANGUAGES, type Language } from "@lumi/shared-contracts/language"

import { cn } from "@/lib/utils"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"

import { languageLabel, translationStatus, type TranslationStatus, type TranslationStatusLike } from "./languages"
import TranslationStatusBadge from "./TranslationStatusBadge"
import type { ContentLanguage } from "./useContentLanguage"

interface IProps {
  // Result of useContentLanguage
  control: ContentLanguage
  // The record's translations, to show which languages it has
  translations: readonly TranslationStatusLike[]
  // The record's status in a language, for records whose nested items count too (recordTranslationStatus). Defaults to
  // the record's own translation status
  getStatus?: (language: Language) => TranslationStatus
  // Actions on the language being edited, after the languages, e.g. AiTranslateButton
  children?: ReactNode
  className?: string
}

// Picks the language a record form edits, each listed by its own name with its translation status, and asks before
// discarding unsaved changes. Only for existing records: new ones are created in English, with EnglishFirstNote in its place
export default function LanguageSwitcher({ control, translations, getStatus, children, className }: IProps) {
  const { language, requestLanguage, pendingLanguage, confirmPendingLanguage, cancelPendingLanguage } = control
  const labelId = useId()

  return (
    <>
      <div className={cn("flex flex-wrap items-center gap-3", className)}>
        <span id={labelId} className="text-sm font-medium text-slate-600">
          Language
        </span>
        <div role="group" aria-labelledby={labelId} className="inline-flex rounded-md border border-slate-200 bg-slate-100 p-1">
          {LANGUAGES.map((option) => {
            const selected = option === language
            const status = getStatus?.(option) ?? translationStatus(translations, option)

            return (
              <button
                key={option}
                type="button"
                aria-pressed={selected}
                onClick={() => requestLanguage(option)}
                className={cn(
                  "focus-visible:ring-ring inline-flex items-center gap-2 rounded px-3 py-1.5 text-sm font-medium text-slate-600 transition-colors hover:text-slate-900 focus-visible:ring-2 focus-visible:outline-none",
                  selected && "bg-white text-slate-900 shadow-sm"
                )}
              >
                <span lang={option}>{LANGUAGE_NAMES[option]}</span>
                {option !== DEFAULT_LANGUAGE && status !== "translated" && <TranslationStatusBadge status={status} />}
              </button>
            )
          })}
        </div>
        {children}
      </div>

      <AlertDialog open={pendingLanguage !== null} onOpenChange={(open) => !open && cancelPendingLanguage()}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Discard unsaved changes?</AlertDialogTitle>
            <AlertDialogDescription>
              Your changes to the {languageLabel(language)} content haven&apos;t been saved. Save them first to keep them, or discard them to switch
              to {pendingLanguage ? languageLabel(pendingLanguage) : "another language"}.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep editing</AlertDialogCancel>
            <AlertDialogAction onClick={confirmPendingLanguage}>Discard changes</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
