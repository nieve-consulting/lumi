import { useState } from "react"
import { Star } from "lucide-react"

import { cn } from "@/lib/utils"

interface IProps {
  value: number
  onChange: (value: number) => void
  // Shows the rating without letting it be changed
  disabled?: boolean
}

export default function Stars({ value, onChange, disabled = false }: IProps) {
  const [isHovered, setIsHovered] = useState<boolean>(false)
  const [hoveredStar, setHoveredStar] = useState<number>(0)

  return (
    <div
      className="flex gap-0 *:px-1"
      aria-disabled={disabled || undefined}
      onMouseEnter={() => !disabled && setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      {[1, 2, 3, 4, 5].map((starValue) => (
        <span
          key={starValue}
          onClick={() => !disabled && onChange(starValue)}
          onMouseEnter={() => setHoveredStar(starValue)}
          onMouseLeave={() => setHoveredStar(0)}
          className={cn("focus:outline-none", disabled ? "cursor-not-allowed" : "cursor-pointer")}
        >
          {(!isHovered && value >= starValue) || (isHovered && hoveredStar >= starValue) ? (
            <Star size={24} className="text-yellow-400" />
          ) : (
            <Star className={cn("text-slate-200", !disabled && "hover:text-slate-400")} size={24} />
          )}
        </span>
      ))}
    </div>
  )
}
