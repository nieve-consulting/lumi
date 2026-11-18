"use server"

import { CalendarAvailabilityArgs, Query } from "@/generated/graphql"
import { gql } from "@apollo/client"

import { getClient } from "@/lib/apiClient"

export async function getAvailability() {
  const client = getClient()

  return await client
    .query<Query, CalendarAvailabilityArgs>({
      query: gql`
        query {
          calendar {
            meetingDurationMins
            availability {
              slots {
                start
                end
              }
            }
          }
        }
      `,
    })
    .then((response) => {
      const calendar = response?.data?.calendar

      return { meetingDurationMins: calendar?.meetingDurationMins, slots: calendar?.availability?.slots || [] }
    })
}
