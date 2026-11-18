import { Resolvers } from "@/generated/graphql"

import { addEvent, freeSlots, getAppointmentSettings } from "./events"

export const appointmentsResolvers: Resolvers = {
  Query: { calendar: async (_, _args, context) => getAppointmentSettings(context.dataSources) },
  Calendar: {
    availability: async (calendar, { startDate, endDate }, context) => {
      const startJsDate = new Date(startDate ? startDate * 1000 : Date.now() + calendar.sameDayMinHours * 60 * 60 * 1000)
      const endJsDate = new Date(endDate ? endDate * 1000 : Date.now() + calendar.maxDaysOut * 24 * 60 * 60 * 1000)

      const slots = await freeSlots(context.dataSources.gCalendar, calendar, startJsDate, endJsDate)
      return { slots: slots.map((slot) => ({ start: slot.start.getTime() / 1000, end: slot.end.getTime() / 1000 })) }
    },
  },
  Mutation: {
    addEvent: async (_, { threadId, input }, context) => addEvent(context.dataSources, threadId, input),
    upsertAppointmentSettings: async (_, { data }, context) => context.dataSources.db.upsertAppointmentSettings(data),
  },
}
