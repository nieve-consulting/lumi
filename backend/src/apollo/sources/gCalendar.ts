import { decodeServiceAccountKey } from "@/utils/serviceAccountKey"
import { calendar } from "@googleapis/calendar"
import { JWT } from "google-auth-library"

// One client per impersonated user and process: its JWT keeps the access token until it expires, so a warm Lambda does not
// fetch a new one from Google on every call
const calendars = new Map<string, ReturnType<typeof calendar>>()

export default class GCalendarSource {
  async getCalendar(impersonatedUser: string) {
    const cached = calendars.get(impersonatedUser)
    if (cached) {
      return cached
    }

    if (!process.env.GOOGLE_SERVICE_ACCOUNT_CREDENTIALS) {
      throw new Error("GOOGLE_SERVICE_ACCOUNT_CREDENTIALS environment variable is not set.")
    }

    // A base64-encoded service account JSON key
    const credentials = decodeServiceAccountKey(process.env.GOOGLE_SERVICE_ACCOUNT_CREDENTIALS)
    if (!credentials) {
      throw new Error("GOOGLE_SERVICE_ACCOUNT_CREDENTIALS is not a base64-encoded service account JSON key.")
    }
    const scopes = ["https://www.googleapis.com/auth/calendar"]

    const auth = new JWT({ email: credentials.clientEmail, key: credentials.privateKey, scopes, subject: impersonatedUser })

    const client = calendar({ version: "v3", auth })
    calendars.set(impersonatedUser, client)

    return client
  }

  async getFreeBusy(impersonatedUser: string, minTime: Date, maxTime: Date, calendarIds: string[]) {
    try {
      const calendar = await this.getCalendar(impersonatedUser)

      const requestBody = { timeMin: minTime.toISOString(), timeMax: maxTime.toISOString(), items: calendarIds.map((c) => ({ id: c })) }

      const response = await calendar.freebusy.query({ requestBody })
      return response.data
    } catch (error) {
      // Rethrow so availability reports the failure instead of an empty calendar
      console.error("Error fetching Free/Busy slots:", error)
      throw error
    }
  }

  async createEvent(
    bookingEmail: string,
    timeZone: string,
    start: Date,
    end: Date,
    emails: string[],
    hostEmails: string[],
    name?: string,
    topic?: string,
    summary?: string
  ) {
    try {
      const calendar = await this.getCalendar(bookingEmail)

      const event = {
        summary: topic,
        description: summary,
        start: { dateTime: start.toISOString(), timeZone },
        end: { dateTime: end.toISOString(), timeZone },
        attendees: [...hostEmails.map((email) => ({ email, organizer: true })), ...emails.map((email) => ({ email }))],
        reminders: { useDefault: false, overrides: [{ method: "email", minutes: 24 * 60 }] },
        conferenceData: {
          createRequest: {
            requestId: new Date().getTime().toString(), // Unique request ID
            conferenceSolutionKey: { type: "hangoutsMeet" }, // Generates Google Meet link
          },
        },
      }

      const response = await calendar.events.insert({ calendarId: "primary", requestBody: event, sendUpdates: "all", conferenceDataVersion: 1 })

      return response.data
    } catch (error) {
      console.error("Error creating event:", error)
      throw error
    }
  }
}
