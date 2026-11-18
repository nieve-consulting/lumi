export const appointmentsTypeDefs = /* GraphQL */ `
  type Slot {
    start: Int
    end: Int
  }

  type Availability {
    slots: [Slot]
  }

  type AllowedTime {
    hour: Int!
    minutes: Int!
  }

  type Calendar {
    meetingDurationMins: Int!
    minAvailableTimeBeforeSlot: Int!
    allowedTimes: [AllowedTime!]!
    allowedDays: [Int!]!
    sameDayMinHours: Int!
    maxDaysOut: Int!
    hostTimezone: String!
    calendars: [String!]!
    bookingEmail: String!
    availability(startDate: Int, endDate: Int): Availability
  }

  type Query {
    calendar: Calendar
  }

  input EventInput {
    start: Int!
    end: Int!
    conversationUrl: String!
    email: String!
    phone: String
    name: String
    topic: String
    summary: String
  }

  input AllowedTimeInput {
    hour: Int!
    minutes: Int!
  }

  input CalendarInput {
    meetingDurationMins: Int
    minAvailableTimeBeforeSlot: Int
    allowedTimes: [AllowedTimeInput!]
    allowedDays: [Int!]
    sameDayMinHours: Int
    maxDaysOut: Int
    hostTimezone: String
    calendars: [String!]
    bookingEmail: String
  }

  type Mutation {
    addEvent(threadId: ID!, input: EventInput!): Boolean
    upsertAppointmentSettings(data: CalendarInput!): Boolean
  }
`
