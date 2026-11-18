import { DEFAULT_HOST_TIMEZONE } from "@/apollo/sources/dbDataSource"
import type GCalendarSource from "@/apollo/sources/gCalendar"
import type { Context } from "@/apollo/types"
import type { EventInput } from "@/generated/graphql"
import { escapeHtml } from "@/utils/escapeHtml"
import { DateTime } from "luxon"

import { getFreeSlots, mergeTimeSlots } from "./utils"

type EventDataSources = Pick<Context["dataSources"], "db" | "gCalendar" | "aws">

export async function getAppointmentSettings(dataSources: Pick<Context["dataSources"], "db">) {
  const data = await dataSources.db.getAppointmentSettings()

  return data
    ? {
        meetingDurationMins: data.meeting_duration,
        minAvailableTimeBeforeSlot: data.time_before_slot,
        allowedTimes: data.allowed_times,
        allowedDays: data.allowed_days,
        sameDayMinHours: data.same_day_min_hours,
        maxDaysOut: data.max_days_out,
        hostTimezone: data.host_timezone,
        calendars: data.calendars,
        bookingEmail: data.booking_email,
      }
    : {
        meetingDurationMins: 45,
        minAvailableTimeBeforeSlot: 5,
        allowedTimes: [
          { hour: 9, minutes: 30 },
          { hour: 17, minutes: 30 },
        ],
        allowedDays: [1, 2, 3, 4, 5],
        sameDayMinHours: 4,
        maxDaysOut: 60,
        hostTimezone: DEFAULT_HOST_TIMEZONE,
        calendars: [],
        bookingEmail: "",
      }
}

type AppointmentSettings = Awaited<ReturnType<typeof getAppointmentSettings>>
type AvailabilitySettings = Pick<
  AppointmentSettings,
  "meetingDurationMins" | "minAvailableTimeBeforeSlot" | "allowedTimes" | "allowedDays" | "hostTimezone" | "calendars" | "bookingEmail"
>

// The free meeting slots between two times: the allowed days and times of the appointment settings outside the busy times of
// the host calendars. What the meeting picker offers (Calendar.availability) and what a booking is checked against
export async function freeSlots(gCalendar: GCalendarSource, settings: AvailabilitySettings, from: Date, to: Date) {
  // From the free time a slot needs before it, so a meeting ending just before the first slot counts
  const busyFrom = new Date(from.getTime() - settings.minAvailableTimeBeforeSlot * 60 * 1000)
  const response = await gCalendar.getFreeBusy(settings.bookingEmail, busyFrom, to, settings.calendars)
  if (!response?.calendars) return []

  const busy = Object.values(response.calendars).flatMap((calendar) =>
    (calendar.busy || [])
      .map((slot) => (slot.start && slot.end ? { start: new Date(slot.start), end: new Date(slot.end) } : null))
      .filter((slot) => slot !== null)
  )

  return getFreeSlots(
    mergeTimeSlots(busy),
    settings.meetingDurationMins,
    settings.minAvailableTimeBeforeSlot,
    settings.allowedTimes,
    settings.allowedDays,
    settings.hostTimezone,
    { start: from, end: to }
  )
}

// A picker may stay open a while before the visitor books, so a slot that was far enough ahead when it was offered is still
// accepted for this long after it no longer is
const PICKER_GRACE_MS = 15 * 60 * 1000

// Why the visitor can't book the slot ([start, end] in unix seconds) whatever the calendars hold, or undefined: it must last
// the meeting duration and start in the future within the days the picker offers. Checked before isSlotFree, which asks
// the calendar
export function slotTimingProblem(settings: AppointmentSettings, [startSeconds, endSeconds]: [number, number]) {
  const now = Date.now()
  const start = startSeconds * 1000
  const end = endSeconds * 1000

  if (endSeconds - startSeconds !== settings.meetingDurationMins * 60) {
    return `The meeting must last ${settings.meetingDurationMins} minutes`
  }
  if (start <= now || start < now + settings.sameDayMinHours * 60 * 60 * 1000 - PICKER_GRACE_MS) {
    return "This time is too soon to book. Choose a later time"
  }
  if (end > now + settings.maxDaysOut * 24 * 60 * 60 * 1000 + PICKER_GRACE_MS) {
    return "This time is too far ahead to book. Choose an earlier time"
  }
}

// Whether the slot ([start, end] in unix seconds) is one of the free slots: within the allowed days and times, outside the
// busy times of the host calendars. The free slots are searched from the slot's own start, so any free start on
// time-slots-finder's five-minute grid is accepted, not only the starts the picker showed. The picker's grid can't be
// reproduced: its first slots of a day start from the time it loaded them, and its later ones shift whenever a meeting is
// added earlier that day, which would refuse a time the picker showed that is still free
export async function isSlotFree(gCalendar: GCalendarSource, settings: AppointmentSettings, [startSeconds, endSeconds]: [number, number]) {
  const start = new Date(startSeconds * 1000)
  const end = new Date(endSeconds * 1000)
  // Searched until a day after the slot, so the busy times around it count as they do for the picker
  const slots = await freeSlots(gCalendar, settings, start, new Date(end.getTime() + 24 * 60 * 60 * 1000))
  return slots.some((slot) => slot.start.getTime() === start.getTime() && slot.end.getTime() === end.getTime())
}

// Books the meeting in the host calendar, emails the hosts and saves the contact details on the thread. settings: the
// appointment settings when the caller already read them, e.g. to check the slot
export async function addEvent(dataSources: EventDataSources, threadId: string, input: EventInput, settings?: AppointmentSettings) {
  settings ??= await getAppointmentSettings(dataSources)
  const start = new Date(input.start * 1000)
  const end = new Date(input.end * 1000)
  const { email, name, topic, summary, phone, conversationUrl } = input
  const html = {
    name: escapeHtml(name ?? ""),
    email: escapeHtml(email),
    phone: escapeHtml(phone ?? ""),
    topic: escapeHtml(topic ?? ""),
    summary: escapeHtml(summary ?? ""),
    conversationUrl: escapeHtml(conversationUrl),
  }

  const response = /* HTML */ `
    <h1>Meeting Request</h1>
    <p>Hi there. This is Lumi. I am writing because <b>${html.name}</b> has requested a meeting with you.</p>
    <p>Here are the details:</p>
    <ul>
      <li><b>Name</b>: ${html.name}</li>
      <li><b>Email</b>: ${html.email}</li>
      <li><b>Phone</b>: ${html.phone || "--"}</li>
      <li><b>Topic</b>: ${html.topic || "--"}</li>
      <li>
        <b>Meeting Time</b>: ${DateTime.fromJSDate(start).setZone(settings.hostTimezone).toLocaleString(DateTime.DATE_FULL)} @
        ${DateTime.fromJSDate(start).setZone(settings.hostTimezone).toLocaleString(DateTime.TIME_SIMPLE)} -
        ${DateTime.fromJSDate(end).setZone(settings.hostTimezone).toLocaleString(DateTime.TIME_SIMPLE)}
      </li>
      <li><b>Summary</b>: <br />${html.summary ? `<pre>${html.summary}</pre>` : "--"}</li>
      <li><b>Conversation</b>: <a href="${html.conversationUrl}">View conversation</a></li>
    </ul>
    <p>Please look for the meeting in you calendar.</p>
    <p>Best,</p>
    <p>Lumi</p>
  `

  const gCalResponse = await dataSources.gCalendar.createEvent(
    settings.bookingEmail,
    settings.hostTimezone,
    start,
    end,
    [email],
    settings.calendars,
    name || undefined,
    topic || undefined,
    summary || undefined
  )

  // The meeting is booked once the calendar event exists, so failing to email the hosts or save the details is only logged:
  // reporting the booking as failed would have the visitor book it again
  const [emailResult, dbResult] = await Promise.allSettled([
    // The subject is plain text: line breaks are dropped so the topic can't add header lines
    dataSources.aws.sendEmail(settings.calendars, `[Lumi Meeting Request] ${(topic || "").replace(/[\r\n]+/g, " ")}`, response),
    dataSources.db.updateThread(threadId, { email, topic, summary, phone, name }),
  ])
  if (emailResult.status === "rejected") console.error("Error emailing the hosts about the meeting of thread", threadId, emailResult.reason)
  if (dbResult.status === "rejected") console.error("Error saving the meeting details of thread", threadId, dbResult.reason)

  return !!gCalResponse && dbResult.status === "fulfilled" && dbResult.value
}
