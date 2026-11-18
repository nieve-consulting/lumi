import type { ReactNode } from "react"
import { DEFAULT_LANGUAGE, type Language } from "@lumi/shared-contracts/language"
import { Info, TriangleAlert } from "lucide-react"
import { DateTime } from "luxon"

import { cn } from "@/lib/utils"

import { countOf, findTranslation, languageLabel, translationStatus, type NestedNeedingReview, type TranslationStatusLike } from "./languages"

interface IProps {
  language: Language
  // The record's translations, to tell whether this language is missing, a draft or outdated
  translations: readonly TranslationStatusLike[]
  // Labels of the content a translation must have, e.g. ["Name"]; empty when every field can be left untranslated
  required: readonly string[]
  // Nested items (e.g. experiences) missing, drafts or outdated in the language (nestedNeedingReview), with their name,
  // e.g. { count: 2, drafts: 1, outdatedDrafts: 0, singular: "experience", plural: "experiences" }, and how many the AI translation filled
  // that nobody has opened since (useNestedReview's aiTranslatedCount)
  nestedReview?: NestedNeedingReview & { singular: string; plural: string; aiTranslated?: number }
  // Replaces the default note about the fields shared by every language
  sharedNote?: ReactNode
  className?: string
}

const formatDate = (iso: string) => DateTime.fromISO(iso, { zone: "utc" }).setLocale("en").toFormat("d LLL yyyy")
const listFormat = new Intl.ListFormat("en", { type: "conjunction" })

// Which of the nested items needing review are AI drafts, and how many of those were made before English last changed,
// e.g. "2 of them are AI drafts, 1 made before English last changed: visitors see English until you save them."
function draftsNote(drafts: number, outdatedDrafts: number, count: number) {
  const which =
    drafts === count
      ? drafts === 1
        ? "It's an AI draft"
        : "They're AI drafts"
      : `${drafts} of them ${drafts === 1 ? "is an AI draft" : "are AI drafts"}`
  const since =
    outdatedDrafts === 0
      ? ""
      : outdatedDrafts === drafts
        ? ", made before English last changed"
        : `, ${outdatedDrafts} made before English last changed`
  return `${which}${since}: visitors see English until you save ${drafts === 1 ? "it" : "them"}.`
}

// Explains, outside English, what a form edits in the language: only translatable content, the rest being shared and
// edited in English, with the required content named and the rest read in English while empty. Flags a missing, draft or
// outdated translation, or a draft made before English last changed, and nested items needing review. Renders nothing in
// English
export default function TranslationNotice({ language, translations, required, nestedReview, sharedNote, className }: IProps) {
  if (language === DEFAULT_LANGUAGE) return null

  const name = languageLabel(language)
  const status = translationStatus(translations, language)
  const updatedAt = findTranslation(translations, language)?.updated_at
  const nestedCount = nestedReview?.count ?? 0
  const nestedDrafts = nestedReview?.drafts ?? 0
  const nestedOutdatedDrafts = nestedReview?.outdatedDrafts ?? 0
  const aiTranslatedCount = nestedReview?.aiTranslated ?? 0
  // A draft or outdated, or translated with nested items needing review, as the records list shows it, or with
  // AI-translated items that the save would leave out
  const warn = (status !== "missing" && (status !== "translated" || nestedCount > 0)) || aiTranslatedCount > 0

  return (
    <div
      className={cn(
        "flex gap-3 rounded-md border p-3 text-sm",
        warn ? "border-amber-300 bg-amber-50 text-amber-950" : "border-slate-200 bg-slate-50 text-slate-700",
        className
      )}
    >
      {warn ? <TriangleAlert size={18} className="mt-0.5 shrink-0" aria-hidden /> : <Info size={18} className="mt-0.5 shrink-0" aria-hidden />}
      <div className="space-y-1">
        {status === "missing" && <p className="font-medium">No {name} translation yet. Visitors see this record in English until you save one.</p>}
        {status === "draft" && (
          <p className="font-medium">This {name} translation is an AI draft: visitors see English until you review it and save.</p>
        )}
        {status === "outdated_draft" && (
          <p className="font-medium">
            This {name} translation is an AI draft
            {updatedAt ? ` from ${formatDate(updatedAt)}, and English has changed since` : ", and English changed after it was made"}. Review it
            against the current English and save: visitors see English until you do.
          </p>
        )}
        {status === "outdated" && (
          <p className="font-medium">
            English changed after this translation was saved{updatedAt ? ` on ${formatDate(updatedAt)}` : ""}. Review it and save to mark it up to
            date.
          </p>
        )}
        {nestedReview && nestedCount > 0 && (
          <p className="font-medium">
            {nestedCount} {nestedCount === 1 ? `${nestedReview.singular} needs` : `${nestedReview.plural} need`} review in {name}.{" "}
            {nestedCount === 1
              ? "Open it to review it: saving marks it up to date once you've opened or edited it."
              : "Open each one to review it: saving marks the ones you opened or edited up to date, and the rest still need review."}
            {nestedDrafts > 0 && ` ${draftsNote(nestedDrafts, nestedOutdatedDrafts, nestedCount)}`}
          </p>
        )}
        {nestedReview && aiTranslatedCount > 0 && (
          <p className="font-medium">
            The AI translation filled {countOf(aiTranslatedCount, nestedReview.singular, nestedReview.plural)}.{" "}
            {aiTranslatedCount === 1
              ? "Open it to review it: it isn't saved until you do."
              : "Open each one to review it: unopened ones aren't saved."}
          </p>
        )}
        <p>
          {sharedNote ?? "Fields that are the same in every language are read-only here; switch to English to change them."}{" "}
          {required.length > 0
            ? `Required in ${name}: ${listFormat.format(required)}. Other fields can stay empty; visitors then read them in English.`
            : "Every field can stay empty; visitors then read it in English."}
        </p>
      </div>
    </div>
  )
}
