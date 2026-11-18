"use client"

import * as React from "react"

import { cn } from "@/lib/utils"

interface CheckboxProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, "type"> {
  // Some but not all of what it stands for is checked, e.g. a table's "select all" with some rows selected
  indeterminate?: boolean
}

// A native checkbox in the theme's colours, which can show the indeterminate state
const Checkbox = React.forwardRef<HTMLInputElement, CheckboxProps>(({ className, indeterminate = false, ...props }, ref) => {
  const innerRef = React.useRef<HTMLInputElement>(null)
  React.useImperativeHandle(ref, () => innerRef.current!)

  // Only settable from script, so it follows the prop after every render: a click clears it in the DOM even when the prop
  // stays the same
  React.useEffect(() => {
    if (innerRef.current) innerRef.current.indeterminate = indeterminate
  })

  return (
    <input
      ref={innerRef}
      type="checkbox"
      className={cn(
        "accent-primary focus-visible:ring-ring size-4 shrink-0 cursor-pointer rounded-sm focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50",
        className
      )}
      {...props}
    />
  )
})
Checkbox.displayName = "Checkbox"

export { Checkbox }
