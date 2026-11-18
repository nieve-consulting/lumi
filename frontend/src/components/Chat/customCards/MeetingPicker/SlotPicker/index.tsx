import { useMemo, useState } from "react"
import type { Language } from "@lumi/shared-contracts/language"
import { DateTime } from "luxon"
import { labelDayButton, type DayPickerLocale } from "react-day-picker"
import { enUS } from "react-day-picker/locale/en-US"
import { es } from "react-day-picker/locale/es"

import { useFormattingLocale, useI18n } from "@/lib/i18n/LanguageProvider"
import { cn } from "@/lib/utils"
import { buttonVariants } from "@/components/ui/button"
import { Calendar } from "@/components/ui/calendar"

import { getDaysWithAvailableSlots } from "./utils"

import "./calendar.css"

import SlotList from "./SlotList"

// Month and weekday names and the navigation labels in the chat's language
const CALENDAR_LOCALES: Record<Language, DayPickerLocale> = { en: enUS, es }

interface IProps {
  slotDurationMins: number
  // Never empty: the meeting card shows its own message when there are no slots
  availableSlots: DateTime[]
  value: [DateTime | null, DateTime | null]
  onChange: (value: [DateTime | null, DateTime | null]) => void
}

export default function SlotPicker({ availableSlots: unsortedSlots, slotDurationMins, value, onChange }: IProps) {
  const { language, t } = useI18n()
  const locale = useFormattingLocale()
  const calendarLocale = CALENDAR_LOCALES[language]
  // Sorted here so the first and last slots fall on the earliest and latest available days whatever order they arrive in
  const availableSlots = useMemo(() => [...unsortedSlots].sort((a, b) => a.toMillis() - b.toMillis()), [unsortedSlots])
  const [date, setDate] = useState<Date>(() => availableSlots[0].startOf("day").toJSDate())
  const [month, setMonth] = useState<Date>(date)
  const [startMonth, endMonth, availableDays, lastAvailableDay] = useMemo(() => {
    const lastSlot = availableSlots[availableSlots.length - 1]
    return [
      DateTime.min(DateTime.now(), availableSlots[0]).toJSDate(),
      lastSlot.toJSDate(),
      getDaysWithAvailableSlots(availableSlots),
      lastSlot.startOf("day"),
    ] as const
  }, [availableSlots])

  const slots = useMemo(() => {
    const targetDay = DateTime.fromJSDate(date)
    return availableSlots.filter((slot) => slot.hasSame(targetDay, "day"))
  }, [date, availableSlots])

  function selectDate(newDate: Date) {
    setDate(newDate)
    setMonth(newDate)
    onChange([null, null])
  }

  // Picking a day in the calendar keeps focus there, so announce what the slot list now shows
  const [dayAnnouncement, setDayAnnouncement] = useState("")

  function onCalendarSelect(newDate: Date) {
    selectDate(newDate)
    const day = DateTime.fromJSDate(newDate).startOf("day")
    const dayLabel = day.toFormat(t.slots.announcedDayFormat, { locale })
    const count = availableSlots.filter((slot) => slot.hasSame(day, "day")).length
    if (count) {
      setDayAnnouncement(t.slots.timesOn(count, dayLabel))
      return
    }
    // The day's label already says it has no meeting times, so point to where there are some
    const nextSlot = availableSlots.find((slot) => slot >= day.plus({ days: 1 }))
    setDayAnnouncement(t.slots.noTimesOn(dayLabel, nextSlot?.toFormat(t.slots.announcedDayFormat, { locale })))
  }

  function onSlotChanged(slot: DateTime) {
    onChange([slot, slot.plus({ minutes: slotDurationMins })])
  }

  const nextAvailableDay = useMemo(() => {
    const followingDay = DateTime.fromJSDate(date).startOf("day").plus({ days: 1 })
    return availableSlots.find((slot) => slot >= followingDay)?.startOf("day") ?? null
  }, [date, availableSlots])

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <p role="status" className="sr-only">
        {dayAnnouncement}
      </p>
      <Calendar
        required={true}
        month={month}
        onMonthChange={setMonth}
        showOutsideDays={false}
        mode="single"
        selected={date}
        startMonth={startMonth}
        endMonth={endMonth}
        onSelect={onCalendarSelect}
        className="rounded-md border"
        modifiers={{ availableDays }}
        locale={calendarLocale}
        // Days without slots are only struck through visually, so tell screen readers too
        labels={{
          labelDayButton: (date, modifiers, options, dateLib) => {
            const localeLabel = calendarLocale.labels?.labelDayButton
            const label =
              typeof localeLabel === "function" ? localeLabel(date, modifiers, options, dateLib) : labelDayButton(date, modifiers, options, dateLib)
            return modifiers.availableDays ? label : `${label}${t.slots.dayWithoutTimes}`
          },
        }}
        weekStartsOn={1}
        classNames={{
          button_previous: cn(buttonVariants({ variant: "outline" }), "size-7 bg-transparent p-0 opacity-50 hover:opacity-100 [&_svg]:size-6"),
          button_next: cn(buttonVariants({ variant: "outline" }), "size-7 bg-transparent p-0 opacity-50 hover:opacity-100 [&_svg]:size-6"),
          caption_label: "text-xl font-medium ml-1",
          day: "h-9 w-9 text-center p-0 m-1",
          today: "text-primary font-bold",
          day_button: "size-9 rounded-full",
          selected: "bg-primary! font-bold rounded-full text-white",
          weekdays: "flex w-full",
          weekday: "w-9 p-0 m-1 font-medium",
          disabled: "text-slate-500",
        }}
        modifiersClassNames={{ availableDays: "available" }}
      />
      <SlotList
        day={DateTime.fromJSDate(date).startOf("day")}
        slots={slots}
        value={value[0]}
        onChange={onSlotChanged}
        nextAvailableDay={nextAvailableDay}
        lastAvailableDay={lastAvailableDay}
        onDaySelected={(day) => {
          // Focus moves to the slot heading instead, and clearing lets the same calendar pick announce again later
          setDayAnnouncement("")
          selectDate(day.toJSDate())
        }}
      />
    </div>
  )
}
