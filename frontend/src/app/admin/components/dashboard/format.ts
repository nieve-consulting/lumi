import { DateTime, IANAZone } from "luxon"

const numberFormat = new Intl.NumberFormat("en-US")
const compactFormat = new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 })
const percentFormat = new Intl.NumberFormat("en-US", { style: "percent", maximumFractionDigits: 0 })

export function formatNumber(value: number) {
  return numberFormat.format(value)
}

// Token counts get large quickly: 12.9K, 4.2M
export function formatCompact(value: number) {
  return compactFormat.format(value)
}

// "1 call", "3 calls"
export function formatCount(count: number, noun: string) {
  return `${numberFormat.format(count)} ${noun}${count === 1 ? "" : "s"}`
}

// "--" when there is nothing to divide by
export function formatShare(part: number, total: number) {
  return total > 0 ? percentFormat.format(part / total) : "--"
}

// Dashboard days are YYYY-MM-DD dates in the dashboard time zone
export function formatDay(date: string, format = "LLL d") {
  return DateTime.fromISO(date).toFormat(format)
}

// In the dashboard time zone: these tables render on the server, whose time zone is not the admin's
export function formatDateTime(iso: string, timeZone: string) {
  return DateTime.fromISO(iso, { zone: timeZone }).toFormat("LLL d, yyyy @ HH:mm")
}

// The appointments host's time zone is the company's, as on the dashboard. One saved from an admin's browser may be unknown
// here, so dates are then shown in UTC, as the dashboard does
export function companyTimeZone(hostTimezone: string | null | undefined) {
  return hostTimezone && IANAZone.isValidZone(hostTimezone) ? hostTimezone : "UTC"
}
