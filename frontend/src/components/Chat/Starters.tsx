import type { StarterIcon } from "@lumi/shared-contracts/business"

import { useBusiness } from "@/lib/BusinessProvider"
import { useI18n } from "@/lib/i18n/LanguageProvider"

import { Button } from "../ui/button"
import { STARTER_ICON_COMPONENTS } from "./starterIcons"

// The built-in entry points, for prospective clients, visitors exploring the business and job candidates, unless the
// business sets its own. Those about the business's work and job openings only show while its projects and job openings are on
const BUILT_IN = [
  { key: "discussProject", icon: "message", source: undefined },
  { key: "exploreWork", icon: "folder", source: "projects" },
  { key: "findJobs", icon: "briefcase", source: "jobOpenings" },
] as const

interface IProps {
  // hadFocus: whether the starter had focus, which has to move on as the starters go away once the conversation starts
  onStart: (message: string, hadFocus: boolean) => void
}

// Suggested first messages. Each sends its message, in the chat's language, as the visitor's first, so the conversation goes
// on as if they had typed it. Nothing shows when the business sets an empty list
export default function Starters({ onStart }: IProps) {
  const { language, t } = useI18n()

  const business = useBusiness()

  // A starter the business didn't write in the chat's language shows the default language's text, so it is marked with that
  // language for screen readers
  const { defaultLanguage } = business
  const starters: { icon?: StarterIcon; label: string; message: string; lang?: string }[] = business.starters
    ? business.starters.map(({ icon, label, message, languages }) => ({
        icon,
        label: label[language],
        message: message[language],
        lang: languages.includes(language) ? undefined : defaultLanguage,
      }))
    : BUILT_IN.filter(({ source }) => !source || business.starterSources[source]).map(({ key, icon }) => ({ icon, ...t.starters[key] }))
  if (!starters.length) return null

  return (
    // Lined up with the greeting's text, past its avatar
    <div role="group" aria-label={t.starters.label} className="mr-6 ml-12 flex flex-wrap gap-2 lg:mr-36">
      {starters.map(({ icon, label, message, lang }, index) => {
        const Icon = icon && STARTER_ICON_COMPONENTS[icon]
        return (
          // Wraps a long label onto several lines rather than overflowing a phone's width
          <Button
            key={index}
            variant="outline"
            size="sm"
            className="h-auto min-h-8 py-1.5 text-left whitespace-normal"
            onClick={(event) => onStart(message, document.activeElement === event.currentTarget)}
          >
            {Icon && <Icon aria-hidden />}
            <span lang={lang}>{label}</span>
          </Button>
        )
      })}
    </div>
  )
}
