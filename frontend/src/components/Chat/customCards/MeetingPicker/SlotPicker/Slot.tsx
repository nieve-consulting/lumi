import type { MouseEventHandler } from "react"
import clsx from "clsx"
import { DateTime } from "luxon"

import { useFormattingLocale } from "@/lib/i18n/LanguageProvider"
import { Button } from "@/components/ui/button"

interface IProps {
  value: DateTime
  onSelected: (value: DateTime) => void
  selected?: boolean
  className?: string
}

export default function Slot({ value, selected = false, onSelected, className }: IProps) {
  const locale = useFormattingLocale()
  const onSlotClicked: MouseEventHandler<HTMLButtonElement> = (e) => {
    e.preventDefault()
    onSelected(value)
  }

  return (
    <Button
      variant={selected ? "default" : "ghost"}
      className={clsx("w-28 rounded-full border-2 p-2", { "border-slate-400": !selected, "border-primary": selected }, className)}
      onClick={onSlotClicked}
    >
      {value.toLocaleString(DateTime.TIME_SIMPLE, { locale })}
    </Button>
  )
}
