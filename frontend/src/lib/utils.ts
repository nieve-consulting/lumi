import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

// Keys pressed while an IME composes text belong to the composition. WebKit can report them with keyCode 229 and
// isComposing unset
export const isComposingKey = (event: KeyboardEvent) => event.isComposing || event.keyCode === 229

// Whether there's a mouse or trackpad. Any fine pointer counts, so a tablet with a keyboard and trackpad attached has one
export const hasFinePointer = () => window.matchMedia("(any-pointer: fine)").matches

// The admin API reports a failed save as false rather than an error: throws `message` when the result, or any of the
// results (nested lists included, as from a Promise.all of several saves), is false
export function assertSaved(results: unknown, message: string) {
  if ([results].flat(Infinity).some((saved) => saved === false)) throw new Error(message)
}

export function sanitizeFilename(name: string): string {
  // Normalize to NFKD Unicode form
  let sanitized = name.normalize("NFD")

  // Remove any non-alphanumeric characters
  sanitized = sanitized.replace(/[^a-zA-Z0-9\s]/g, "")

  // Replace spaces with underscores
  sanitized = sanitized.replace(/\s+/g, "_")

  // Trim leading and trailing underscores
  sanitized = sanitized.replace(/^_+|_+$/g, "")

  // Optionally, truncate to a maximum length (e.g., 255 characters)
  if (sanitized.length > 255) {
    sanitized = sanitized.substring(0, 255)
  }

  return sanitized
}

const costFormat = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2, maximumFractionDigits: 4 })

// Smallest cost the format shows: anything below it rounds to $0.00
const MIN_COST = 0.0001

// LLM costs are often fractions of a cent, so they keep up to four decimals. Smaller non-zero costs show as "<$0.0001"
// rather than rounding to $0.00, which would read as free
export function formatCost(cost: number): string {
  if (cost > 0 && cost < MIN_COST) return `<${costFormat.format(MIN_COST)}`

  return costFormat.format(cost)
}
