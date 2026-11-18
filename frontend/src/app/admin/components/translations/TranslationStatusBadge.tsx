import { cn } from "@/lib/utils"

import type { TranslationStatus } from "./languages"

export const TRANSLATION_STATUS_LABELS: Record<TranslationStatus, string> = {
  translated: "Translated",
  missing: "Missing",
  // An AI draft, which visitors don't see until the team reviews and saves it
  draft: "AI draft",
  // An AI draft made before English last changed, to review against the current English
  outdated_draft: "Outdated AI draft",
  outdated: "Outdated",
}

const statusClasses: Record<TranslationStatus, string> = {
  translated: "border-emerald-200 bg-emerald-50 text-emerald-800",
  missing: "border-slate-300 bg-white text-slate-600",
  draft: "border-sky-300 bg-sky-50 text-sky-900",
  outdated_draft: "border-amber-300 bg-amber-50 text-amber-900",
  outdated: "border-amber-300 bg-amber-50 text-amber-900",
}

// A small pill, shared by the status and AI-translated badges
const pillClasses = "inline-flex items-center rounded-full border px-2 py-0.5 text-xs leading-none font-medium whitespace-nowrap"

interface IProps {
  status: TranslationStatus
  className?: string
}

// A nested item (an experience, a contribution) the AI translation filled and nobody has opened since, as a pill like
// TranslationStatusBadge's, in place of its status
export function AiTranslatedBadge({ className }: { className?: string }) {
  return <span className={cn(pillClasses, "border-sky-300 bg-sky-50 text-sky-900", className)}>AI-translated: open to review</span>
}

// A translation's status as a small pill, in the switcher and in records lists
export default function TranslationStatusBadge({ status, className }: IProps) {
  return <span className={cn(pillClasses, statusClasses[status], className)}>{TRANSLATION_STATUS_LABELS[status]}</span>
}
