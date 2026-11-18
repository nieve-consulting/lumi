import { useMemo } from "react"

import { cn } from "@/lib/utils"

interface IProps {
  showMonth?: boolean
  allowEmpty?: boolean
  yearRange?: [number, number] // [years_back, years_forward]
  value?: Date | null
  onChange?: (value: Date | null) => void
  disabled?: boolean
}

const months = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"]

export default function MonthYearPicker({ value, onChange, showMonth = true, allowEmpty = false, yearRange = [10, 0], disabled = false }: IProps) {
  const years = useMemo(() => {
    const currentYear = new Date().getFullYear()
    const startYear = currentYear - yearRange[0]
    const endYear = currentYear + yearRange[1]

    return Array.from({ length: endYear - startYear + 1 }, (_, index) => startYear + index)
  }, [yearRange])
  const month = !showMonth ? 0 : value ? value.getMonth() : 0
  const year = value ? value.getFullYear() : -1

  function onMonthChange(e: React.ChangeEvent<HTMLSelectElement>) {
    if (year < 0) return
    if (onChange) onChange(new Date(year, parseInt(e.target.value), 1))
  }

  function onYearChange(e: React.ChangeEvent<HTMLSelectElement>) {
    if (onChange) {
      if (parseInt(e.target.value) < 0) {
        onChange(null)
      } else {
        onChange(new Date(parseInt(e.target.value), month, 1))
      }
    }
  }

  return (
    <div className={cn("border-input flex justify-between gap-3 rounded-md border p-2", disabled && "cursor-not-allowed opacity-50")}>
      {showMonth &&
        (year < 0 ? (
          <select disabled={disabled} className="grow bg-transparent focus:outline-none disabled:cursor-not-allowed">
            <option value={-1} />
          </select>
        ) : (
          <select
            value={month}
            onChange={onMonthChange}
            disabled={disabled}
            className="grow bg-transparent focus:outline-none disabled:cursor-not-allowed"
          >
            {months.map((month, index) => (
              <option key={month} value={index}>
                {month}
              </option>
            ))}
          </select>
        ))}
      <select value={year} onChange={onYearChange} disabled={disabled} className="grow bg-transparent focus:outline-none disabled:cursor-not-allowed">
        {allowEmpty && <option value={-1} />}
        {years.map((year) => (
          <option key={year} value={year}>
            {year}
          </option>
        ))}
      </select>
    </div>
  )
}
