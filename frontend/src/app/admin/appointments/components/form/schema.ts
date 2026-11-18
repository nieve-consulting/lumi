import { z } from "zod"

export const appointmentsSchema = z.object({
  meetingDurationMins: z.coerce.number<number>().int().min(15, { message: "Meeting duration must be at least 15 minutes" }),
  allowedTimes: z
    .array(z.object({ hour: z.number().int().min(0).max(23), minutes: z.number().int().min(0).max(59) }))
    .min(1, { message: "At least one time must be selected" }),
  minAvailableTimeBeforeSlot: z.coerce.number<number>().int().min(0, { message: "Minimum available time before slot must be at least 0" }),
  allowedDays: z.array(z.number().int().min(0).max(6)).min(1, { message: "At least one day must be selected" }),
  sameDayMinHours: z.coerce.number<number>().int().min(1, { message: "Minimum hours must be at least 1" }),
  maxDaysOut: z.coerce.number<number>().int().min(15, { message: "Maximum days out must be at least 15" }),
  hostTimezone: z.string(),
  calendars: z.array(z.object({ value: z.string().email() })).min(1, { message: "At least one calendar must be selected" }),
  bookingEmail: z.string().email({ message: "Booking email must be a valid email" }),
})

export type AppointmentsFormSchema = z.infer<typeof appointmentsSchema>
