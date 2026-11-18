import { ArrowDown } from "lucide-react"

import { useI18n } from "@/lib/i18n/LanguageProvider"
import { cn } from "@/lib/utils"

interface IProps {
  ref?: React.Ref<HTMLButtonElement>
  className?: string
  visible: boolean
  // The latest reply is out of view, and the reader hasn't seen its start
  newResponse: boolean
  onClick: () => void
}

export default function ScrollButton({ ref, visible, newResponse, className, onClick }: IProps) {
  const { t } = useI18n()

  // Sticks to the bottom of the scroll area rather than the viewport, so it stays clear of the prompt as that grows. The
  // wrapper has no height, so it doesn't add to the scrollable content
  return (
    visible && (
      <div className="sticky bottom-2 h-0 self-center">
        <button
          ref={ref}
          type="button"
          className={cn(
            "focus-visible:ring-ring absolute bottom-0 left-1/2 flex -translate-x-1/2 cursor-pointer items-center gap-1 rounded-full border border-slate-400 bg-white whitespace-nowrap text-slate-500 shadow-md outline-none hover:text-slate-700 focus-visible:ring-2",
            newResponse && "py-1 pr-4 pl-2 text-sm font-medium",
            className
          )}
          aria-label={newResponse ? undefined : t.scrollButton.toLatest}
          onClick={onClick}
        >
          <ArrowDown className={newResponse ? "size-6" : "size-10"} aria-hidden />
          {newResponse && t.scrollButton.newResponse}
        </button>
      </div>
    )
  )
}
