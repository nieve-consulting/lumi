import type { MouseEvent } from "react"

interface IProps {
  value: number[]
  onChange: (value: number[]) => void
}

const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]

export function DaysSelector({ value, onChange }: IProps) {
  const onDaySelected = (e: MouseEvent<HTMLButtonElement>, day: number) => {
    e.preventDefault()
    const newValue = value.includes(day) ? value.filter((d) => d !== day) : [...value, day]
    onChange(newValue)
  }

  return (
    <div className="flex gap-2">
      {days.map((day, idx) => (
        <button
          key={day}
          onClick={(e) => onDaySelected(e, idx)}
          className={`size-10 rounded-full text-center text-xs ${value.includes(idx) ? "bg-primary text-white" : "bg-slate-200"}`}
        >
          {day}
        </button>
      ))}
    </div>
  )
}
