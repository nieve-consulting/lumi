import * as React from "react"

import { cn } from "@/lib/utils"

interface ProgressProps extends React.HTMLAttributes<HTMLDivElement> {
  // From 0 to max
  value: number
  max?: number
}

// A horizontal progress bar. Name it with aria-label or aria-labelledby
function Progress({ value, max = 100, className, ...props }: ProgressProps) {
  const percent = max > 0 ? Math.min(100, Math.max(0, (value / max) * 100)) : 0

  return (
    <div
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={max}
      aria-valuenow={value}
      className={cn("bg-secondary relative h-2 w-full overflow-hidden rounded-full", className)}
      {...props}
    >
      <div className="bg-primary h-full transition-[width] duration-300" style={{ width: `${percent}%` }} />
    </div>
  )
}

export { Progress }
