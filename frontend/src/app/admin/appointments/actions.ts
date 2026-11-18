"use server"

import { Mutation, MutationUpsertAppointmentSettingsArgs, type Query } from "@/generated/graphql"
import { gql } from "@apollo/client"

import { getAdminClient } from "@/lib/adminApiClient"

import type { AppointmentsFormSchema } from "./components/form/schema"

export async function getAppintmentsData() {
  const client = await getAdminClient()

  const { data } = await client.query<Query>({
    query: gql`
      query {
        calendar {
          meetingDurationMins
          minAvailableTimeBeforeSlot
          allowedTimes {
            hour
            minutes
          }
          allowedDays
          sameDayMinHours
          maxDaysOut
          hostTimezone
          calendars
          bookingEmail
        }
      }
    `,
  })

  return data?.calendar
}

export async function updateSettings(data: AppointmentsFormSchema) {
  const client = await getAdminClient()

  const { data: response } = await client.mutate<Mutation, MutationUpsertAppointmentSettingsArgs>({
    mutation: gql`
      mutation UpsertAppointmentSettings($data: CalendarInput!) {
        upsertAppointmentSettings(data: $data)
      }
    `,
    variables: { data: { ...data, calendars: data.calendars.map((calendar) => calendar.value) } },
  })

  return response?.upsertAppointmentSettings
}
