import { useMemo, useState } from "react"
import { zodResolver } from "@hookform/resolvers/zod"
import { BOOKING_LIMITS, formatMeetingTime, meetingDataSchema, SLOT_UNAVAILABLE, type MeetingDataType } from "@lumi/shared-contracts/pre-sales"
import { DateTime } from "luxon"
import { useForm } from "react-hook-form"
import { z } from "zod"

import { useBusiness } from "@/lib/BusinessProvider"
import { useFormattingLocale, useI18n } from "@/lib/i18n/LanguageProvider"
import { AgentsApiError } from "@/lib/threads"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form"
import { Input } from "@/components/ui/input"
import { LoadingButton, LoadingButtonState } from "@/components/ui/loading-button"

export enum FormState {
  Idle,
  Success,
}

interface IProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  slot: [DateTime, DateTime]
  data: Partial<MeetingDataType>
  onBookEvent: (formData: SlotPickerDataType) => Promise<void>
  onStateChange: (state: FormState) => void
  // The agents API refused the time as no longer free or bookable, so booking it again can't work
  onSlotUnavailable: () => void
}

const dateTimeSchema = z.custom<DateTime>((val) => val instanceof DateTime && val.isValid, { message: "Invalid DateTime" })

// Validation messages are in the chat's language. Bounded like the agents API's booking schema, as the conversation can prefill
// longer values than the fields let the visitor type
function slotPickerSchema(messages: { invalidEmail: string; pickTime: string; tooLong: (max: number) => string }) {
  const bounded = (max: number) => z.string().max(max, messages.tooLong(max))
  return meetingDataSchema.extend({
    name: bounded(BOOKING_LIMITS.name).optional(),
    email: bounded(BOOKING_LIMITS.email).email(messages.invalidEmail),
    phone: bounded(BOOKING_LIMITS.phone).optional(),
    topic: bounded(BOOKING_LIMITS.topic),
    summary: bounded(BOOKING_LIMITS.summary),
    slot: z.tuple([dateTimeSchema.nullable(), dateTimeSchema.nullable()]).superRefine((value, ctx) => {
      if (value.some((v) => v === null)) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: messages.pickTime })
      }
    }),
  })
}

export type SlotPickerDataType = z.infer<ReturnType<typeof slotPickerSchema>>

// Shared by the booking dialog, the confirmation and the confirmation saved on the thread, so all describe the meeting the
// same way, in the locale sent with the booking
export function formatSlot([start, end]: [DateTime, DateTime], locale: string) {
  return formatMeetingTime([start.toUnixInteger(), end.toUnixInteger()], start.zoneName ?? undefined, locale)
}

export default function BookFormDialog({ open, onOpenChange, slot, data, onBookEvent, onStateChange, onSlotUnavailable }: IProps) {
  const { t } = useI18n()
  const { contact } = useBusiness()
  const locale = useFormattingLocale()
  const [formState, setFormState] = useState<LoadingButtonState>(LoadingButtonState.Idle)
  // Why the booking failed: rate_limited when the visitor's address made too many requests, with how long to wait
  const [sendFailed, setSendFailed] = useState<false | "failed" | { rateLimited: number | undefined }>(false)
  const defaultValues: SlotPickerDataType = {
    name: data?.name || "",
    email: data?.email || "",
    phone: data?.phone || "",
    // Not shown, so cut to what the agents API accepts rather than failing the booking
    summary: (data?.summary || "").slice(0, BOOKING_LIMITS.summary),
    topic: data?.topic || "",
    slot,
  }

  const schema = useMemo(() => slotPickerSchema({ ...t.booking, tooLong: t.handoff.validation.tooLong }), [t])
  const form = useForm<SlotPickerDataType>({ resolver: zodResolver(schema), defaultValues, mode: "onChange" })

  async function onSubmit(formData: SlotPickerDataType) {
    setFormState(LoadingButtonState.Loading)
    setSendFailed(false)
    try {
      await onBookEvent(formData)
      onStateChange(FormState.Success)
    } catch (error) {
      if (error instanceof AgentsApiError && error.code === SLOT_UNAVAILABLE) {
        console.warn("The meeting time can no longer be booked", error)
        onSlotUnavailable()
        return
      }
      // Stay in the dialog so the visitor keeps their time and details and can book again
      const retryAfter = error instanceof AgentsApiError && error.code === "rate_limited" ? error.retryAfterSeconds : null
      setSendFailed(retryAfter === null ? "failed" : { rateLimited: retryAfter && Math.ceil(retryAfter / 60) })
      console.error(error)
    }
    setFormState(LoadingButtonState.Idle)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent closeLabel={t.common.close}>
        <DialogHeader>
          <DialogTitle>{t.booking.title}</DialogTitle>
          <DialogDescription asChild>
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)}>
                <div className="mb-4 border-b border-slate-200 pb-2 text-sm text-slate-600">
                  {formatSlot(slot, locale)}
                  <br />
                  {slot[0].zoneName}
                </div>
                <div className="space-y-4">
                  <FormField
                    control={form.control}
                    name="email"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>{t.booking.email}</FormLabel>
                        <FormControl>
                          <Input {...field} maxLength={BOOKING_LIMITS.email} />
                        </FormControl>
                        <FormDescription>{t.booking.emailHint}</FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="name"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>
                          {t.booking.name} <span className="font-xs text-slate-400">{t.common.optional}</span>
                        </FormLabel>
                        <FormControl>
                          <Input {...field} maxLength={BOOKING_LIMITS.name} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="phone"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>
                          {t.booking.phone} <span className="font-xs text-slate-400">{t.common.optional}</span>
                        </FormLabel>
                        <FormControl>
                          <Input {...field} maxLength={BOOKING_LIMITS.phone} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="topic"
                    render={({ field }) => (
                      <FormItem className="md:col-span-3">
                        <FormLabel>
                          {t.booking.topic} <span className="font-xs text-slate-400">{t.common.optional}</span>
                        </FormLabel>
                        <FormControl>
                          <Input {...field} maxLength={BOOKING_LIMITS.topic} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  {sendFailed && (
                    <p role="alert" className="text-sm text-red-700">
                      {sendFailed !== "failed" ? (
                        contact ? (
                          <>
                            {t.common.tooManyRequestsBefore(sendFailed.rateLimited)}
                            <a href={contact} target="_blank" rel="noopener noreferrer" className="underline">
                              {t.booking.failedLink}
                              <span className="sr-only"> {t.common.opensInNewTab}</span>
                            </a>
                            {t.booking.failedAfter}
                          </>
                        ) : (
                          t.common.tooManyRequests(sendFailed.rateLimited)
                        )
                      ) : contact ? (
                        <>
                          {t.booking.failedBefore}
                          <a href={contact} target="_blank" rel="noopener noreferrer" className="underline">
                            {t.booking.failedLink}
                            <span className="sr-only"> {t.common.opensInNewTab}</span>
                          </a>
                          {t.booking.failedAfter}
                        </>
                      ) : (
                        t.booking.failedWithoutContact
                      )}
                    </p>
                  )}
                  <div className="mt-4 w-full text-right">
                    <Button
                      variant="outline"
                      onClick={(e) => {
                        e.preventDefault()
                        onOpenChange(false)
                      }}
                      className="mr-2"
                    >
                      {t.common.cancel}
                    </Button>
                    <LoadingButton type="submit" state={formState} text={t.booking.submit} loadingText={t.booking.submitting} />
                  </div>
                </div>
              </form>
            </Form>
          </DialogDescription>
        </DialogHeader>
      </DialogContent>
    </Dialog>
  )
}
