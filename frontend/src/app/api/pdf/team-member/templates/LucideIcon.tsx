import { createElement } from "react"
import type { IconNode } from "lucide"

// lucide-react icons are client components and can't be called by renderToString in a route handler,
// so the PDF templates render the plain lucide icon nodes instead.
interface IProps {
  icon: IconNode
  size?: number
  className?: string
}

export default function LucideIcon({ icon, size = 24, className }: IProps) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      {icon.map(([tag, attrs], idx) => createElement(tag, { key: idx, ...attrs }))}
    </svg>
  )
}
