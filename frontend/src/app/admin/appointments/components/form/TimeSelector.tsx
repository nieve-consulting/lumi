"use client"

import { ChangeEventHandler, useMemo } from "react"
import { DateTime } from "luxon"

type Time = { hour: number; minutes: number }

interface ITimeSelector {
  value: Time
  onChange: (value: Time) => void
}

function TimeSelector({ value, onChange }: ITimeSelector) {
  const times = useMemo(() => {
    const hours = Array.from({ length: 24 }, (_, i) => i)
    const minutes = Array.from({ length: 2 }, (_, i) => i * 30)

    return hours.flatMap((hour) => minutes.map((minute) => DateTime.fromObject({ hour, minute }).toFormat("h:mm a")))
  }, [])
  const valueProcessed = useMemo(() => DateTime.fromObject({ hour: value.hour, minute: value.minutes }).toFormat("h:mm a"), [value])

  const onTimeSelected: ChangeEventHandler<HTMLSelectElement> = (e) => {
    const value = e.target.value
    const timeObj = DateTime.fromFormat(value, "h:mm a").toObject()
    onChange({ hour: timeObj.hour || 0, minutes: timeObj.minute || 0 })
  }

  return (
    <select value={valueProcessed} onChange={onTimeSelected} className="appearance-none rounded-md bg-slate-300 px-3 py-1">
      {times.map((time) => (
        <option key={time} value={time}>
          {time}
        </option>
      ))}
    </select>
  )
}

interface ITimeRangeSelector {
  value: Time[]
  onChange: (value: Time[]) => void
}

export function TimeRangeSelector({ value, onChange }: ITimeRangeSelector) {
  return (
    <div>
      <div className="flex space-x-2">
        <TimeSelector value={value[0]} onChange={(start) => onChange([start, value[1]])} />
        <div>-</div>
        <TimeSelector value={value[1]} onChange={(end) => onChange([value[0], end])} />
      </div>
    </div>
  )
}
