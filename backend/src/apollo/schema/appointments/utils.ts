import { DateTime } from "luxon"
import * as TimeSlotsFinder from "time-slots-finder"

type TimeSlot = { start: Date; end: Date }

export function mergeTimeSlots(slots: TimeSlot[]): TimeSlot[] {
  if (slots.length === 0) return []

  // Step 1: Sort slots by start time
  slots.sort((a, b) => a.start.getTime() - b.start.getTime())

  // Step 2: Merge overlapping slots
  const mergedSlots: TimeSlot[] = []
  let currentSlot = slots[0]

  for (let i = 1; i < slots.length; i++) {
    const nextSlot = slots[i]

    if (currentSlot.end >= nextSlot.start) {
      // Overlapping or adjacent, merge them
      currentSlot.end = new Date(Math.max(currentSlot.end.getTime(), nextSlot.end.getTime()))
    } else {
      // No overlap, push currentSlot and move to the next
      mergedSlots.push(currentSlot)
      currentSlot = nextSlot
    }
  }

  // Push the last merged slot
  mergedSlots.push(currentSlot)

  return mergedSlots
}

type AllowedTime = { hour: number; minutes: number }
type AllowedTimeRange = AllowedTime[] // Tuple of min and max times
type AllowedDays = number[] // Array of days (0=Sunday, 6=Saturday)

// time-slots-finder only accepts shift times as `HH:mm`
function toShiftTime({ hour, minutes }: AllowedTime) {
  return `${hour.toString().padStart(2, "0")}:${minutes.toString().padStart(2, "0")}`
}

// time-slots-finder reads unavailable periods as wall-clock time in the host time zone, with 0-based months
function toHostPeriodMoment(date: Date, hostTimezone: string) {
  const local = DateTime.fromJSDate(date).setZone(hostTimezone)
  return { year: local.year, month: local.month - 1, day: local.day, hour: local.hour, minute: local.minute }
}

export function getFreeSlots(
  busySlots: TimeSlot[],
  timeSlotDuration: number, // in minutes
  minAvailableTimeBeforeSlot: number, // in minutes
  allowedTimeRange: AllowedTimeRange,
  allowedDays: AllowedDays,
  hostTimezone: string,
  timeRange: TimeSlot
): TimeSlot[] {
  const filtered = busySlots.filter((slot) => slot.start.getTime() !== slot.end.getTime()) // Filter out zero-length slots

  try {
    const slots = TimeSlotsFinder.getAvailableTimeSlotsInCalendar({
      configuration: {
        timeSlotDuration,
        minAvailableTimeBeforeSlot,
        minTimeBeforeFirstSlot: 0,
        // time-slots-finder uses ISO weekdays (1=Monday, 7=Sunday)
        availablePeriods: allowedDays.map((day) => ({
          isoWeekDay: day === 0 ? 7 : day,
          shifts: [{ startTime: toShiftTime(allowedTimeRange[0]), endTime: toShiftTime(allowedTimeRange[1]) }],
        })),
        unavailablePeriods: filtered.map((slot) => ({
          startAt: toHostPeriodMoment(slot.start, hostTimezone),
          endAt: toHostPeriodMoment(slot.end, hostTimezone),
        })),
        timeZone: hostTimezone,
      },
      from: timeRange.start,
      to: timeRange.end,
    })

    return slots.map((slot) => ({ start: slot.startAt, end: slot.endAt }))
  } catch (error) {
    // Rethrow so availability reports the failure instead of no free slots
    console.error(error)
    throw error
  }
}
