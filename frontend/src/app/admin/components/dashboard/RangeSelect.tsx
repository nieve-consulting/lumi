import Link from "next/link"

import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"

const RANGES = [7, 30, 90] as const
const DEFAULT_RANGE = 30

// Days of the dashboard range from the days search parameter, the default range when it is missing or not an option
export function parseRange(days: string | string[] | undefined) {
  const value = Number(days)

  return RANGES.find((range) => range === value) ?? DEFAULT_RANGE
}

export default function RangeSelect({ days, className }: { days: number; className?: string }) {
  return (
    <nav aria-label="Date range" className={cn("flex flex-wrap gap-2", className)}>
      {RANGES.map((range) => (
        <Button key={range} asChild size="sm" variant={range === days ? "default" : "outline"}>
          <Link href={range === DEFAULT_RANGE ? "/admin" : `/admin?days=${range}`} aria-current={range === days ? "page" : undefined}>
            Last {range} days
          </Link>
        </Button>
      ))}
    </nav>
  )
}
