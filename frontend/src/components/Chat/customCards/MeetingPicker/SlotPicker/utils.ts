import { DateTime } from "luxon"

export function getDaysWithAvailableSlots(slots: DateTime[]) {
  const uniqueDays = new Set<number>()

  slots.forEach((slot) => {
    // Convert the slot's DateTime object to a JavaScript Date (only the date part)
    const jsDate = new Date(slot.year, slot.month - 1, slot.day) // Month is 0-based in JS

    uniqueDays.add(jsDate.getTime()) // Store as timestamp to avoid duplicate dates
  })

  // Convert back to an array of JavaScript Date objects
  return Array.from(uniqueDays).map((timestamp) => new Date(timestamp))
}
