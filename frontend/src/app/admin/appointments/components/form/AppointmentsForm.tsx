"use client"

import { useRouter } from "next/navigation"
import { Calendar } from "@/generated/graphql"
import { zodResolver } from "@hookform/resolvers/zod"
import { useForm } from "react-hook-form"

import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form"
import { Input } from "@/components/ui/input"
import { LoadingButton, LoadingButtonState } from "@/components/ui/loading-button"
import { useToast } from "@/components/ui/use-toast"

import { updateSettings } from "../../actions"
import { CalendarIds } from "./CalendarIds"
import { DaysSelector } from "./DaysSelector"
import { appointmentsSchema, type AppointmentsFormSchema } from "./schema"
import { TimeRangeSelector } from "./TimeSelector"
import { TimezonePicker } from "./TimezonePicker"

interface IProps {
  data: Calendar
}

export default function AppointmentsForm({ data }: IProps) {
  const { toast } = useToast()
  const router = useRouter()

  const defaultValues: AppointmentsFormSchema = { ...data, calendars: data.calendars.map((calendar) => ({ value: calendar })) }

  const form = useForm({ resolver: zodResolver(appointmentsSchema), defaultValues, mode: "onChange" })

  async function onSubmit(data: AppointmentsFormSchema) {
    try {
      await updateSettings(data)
      toast({ title: "Success", description: "Appointment settings updated" })
      router.replace("/admin")
    } catch (e) {
      const err = e as Error
      toast({ variant: "destructive", title: "Error", description: err.message })
    }
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8">
        <div className="grid grid-cols-2 gap-x-4 gap-y-6">
          <FormField
            control={form.control}
            name="meetingDurationMins"
            render={({ field }) => (
              <FormItem className="">
                <FormLabel>Meeting duration (minutes)</FormLabel>
                <FormControl>
                  <Input {...field} type="number" />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="minAvailableTimeBeforeSlot"
            render={({ field }) => (
              <FormItem className="">
                <FormLabel>Minimum free available time before booking (minutes)</FormLabel>
                <FormControl>
                  <Input {...field} type="number" />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="sameDayMinHours"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Minimum time to allow booking for the same day (hours)</FormLabel>
                <FormControl>
                  <Input {...field} type="number" />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="maxDaysOut"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Maximun number of days out to allow booking</FormLabel>
                <FormControl>
                  <Input {...field} type="number" />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="allowedTimes"
            render={({ field }) => (
              <FormItem className="w-full">
                <FormLabel>Allowed times to book</FormLabel>
                <FormControl>
                  <TimeRangeSelector {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="allowedDays"
            render={({ field }) => (
              <FormItem className="w-full">
                <FormLabel>Allowed days to book</FormLabel>
                <FormControl>
                  <DaysSelector {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="hostTimezone"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Host Timezone</FormLabel>
                <FormControl>
                  <div>
                    <TimezonePicker {...field} className="w-full" />
                  </div>
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>
        <hr className="my-12" />
        <div className="grid grid-cols-2 gap-x-4 gap-y-6">
          <div>
            <FormField
              control={form.control}
              name="bookingEmail"
              render={({ field }) => (
                <FormItem className="mb-6">
                  <FormLabel>Email of the person creating the appointment</FormLabel>
                  <FormControl>
                    <Input {...field} type="email" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <CalendarIds form={form} />
          </div>
        </div>

        <div className="w-full text-right">
          <LoadingButton
            state={form.formState.isSubmitting ? LoadingButtonState.Loading : LoadingButtonState.Idle}
            type="submit"
            text="Update"
            loadingText="Updating..."
          />
        </div>
      </form>
    </Form>
  )
}
