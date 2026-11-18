import { useRef } from "react"
import { ArrowLeft, ArrowRight, CalendarX } from "lucide-react"
import { DateTime } from "luxon"

import { useFormattingLocale, useI18n } from "@/lib/i18n/LanguageProvider"
import { Button } from "@/components/ui/button"

import Slot from "./Slot"

interface IProps {
  value: DateTime | null
  onChange: (value: DateTime) => void
  nextAvailableDay: DateTime | null
  lastAvailableDay: DateTime
  onDaySelected: (day: DateTime) => void
  day: DateTime
  slots: DateTime[]
  className?: string
}

export default function SlotList({ day, slots, className, value, onChange, nextAvailableDay, lastAvailableDay, onDaySelected }: IProps) {
  const { t } = useI18n()
  const locale = useFormattingLocale()
  const focusHeading = useRef(false)
  const shownDay = day.toFormat(t.slots.dayFormat, { locale })

  // Availability can cross into another year, so show the year when the target day isn't in the shown day's year
  function formatTargetDay(target: DateTime) {
    return target.toFormat(target.hasSame(day, "year") ? t.slots.targetDayFormat : t.slots.targetDayWithYearFormat, { locale })
  }

  // The clicked button disappears once the day changes, so keep keyboard focus on the new day's slots
  function goToDay(targetDay: DateTime) {
    focusHeading.current = true
    onDaySelected(targetDay)
  }

  function onHeadingMounted(heading: HTMLHeadingElement | null) {
    if (heading && focusHeading.current) {
      focusHeading.current = false
      heading.focus()
    }
  }

  return (
    <div className={className}>
      {slots.length ? (
        <>
          <h3
            ref={onHeadingMounted}
            tabIndex={-1}
            className="focus-visible:ring-ring mb-4 rounded-md text-center text-lg font-bold outline-none focus-visible:ring-2"
          >
            {t.slots.availableOn(shownDay)}
          </h3>
          {slots.map((date, idx) => (
            <Slot className="mx-auto mb-2 block" key={idx} value={date} onSelected={onChange} selected={value?.toMillis() === date.toMillis()} />
          ))}
        </>
      ) : (
        <div className="h-full content-center text-center text-slate-600">
          <CalendarX className="mx-auto mb-2" size={30} />
          {t.slots.noneOn} <b>{shownDay}</b>
          <br />
          {nextAvailableDay ? (
            <Button variant="link" className="h-auto whitespace-normal" onClick={() => goToDay(nextAvailableDay)}>
              {t.slots.nextAvailable(formatTargetDay(nextAvailableDay))} <ArrowRight />
            </Button>
          ) : (
            <>
              <p className="mt-2">{t.slots.noLaterDays}</p>
              <Button variant="link" className="h-auto whitespace-normal" onClick={() => goToDay(lastAvailableDay)}>
                <ArrowLeft /> {t.slots.lastAvailable(formatTargetDay(lastAvailableDay))}
              </Button>
            </>
          )}
        </div>
      )}
    </div>
  )
}
