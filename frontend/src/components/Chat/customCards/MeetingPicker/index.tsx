import { useCallback, useEffect, useId, useRef, useState, type ReactNode } from "react"
import Image from "next/image"
import type { MeetingDataType } from "@lumi/shared-contracts/pre-sales"
import clsx from "clsx"
import { AlertCircle, CalendarCheck, CalendarClock, CalendarX, ExternalLink, Globe, Mail, RotateCw } from "lucide-react"
import { DateTime } from "luxon"

import { useBusiness } from "@/lib/BusinessProvider"
import { useFormattingLocale, useI18n } from "@/lib/i18n/LanguageProvider"
import { addBooking } from "@/lib/threads"
import { LoadingState } from "@/lib/types"
import { Button, type ButtonProps } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"

import { useChatStore } from "../../store/store"
import { getAvailability } from "./actions"
import BookFormDialog, { formatSlot, FormState, type SlotPickerDataType } from "./BookFormDialog"
import SlotPicker from "./SlotPicker"

const localTimeZone = Intl.DateTimeFormat().resolvedOptions().timeZone

export type MeetingDataCardPayload = MeetingDataType & { threadId: string; deleteMessageId: string }

interface IProps {
  data: MeetingDataCardPayload
}

function Heading({ id, children }: { id: string; children?: ReactNode }) {
  const { t } = useI18n()
  const { avatar } = useBusiness()

  return (
    <h2 id={id} className="mb-2 text-2xl font-bold">
      <Image
        src={avatar}
        // Decorative: the heading text names the card
        alt=""
        width={100}
        height={100}
        className="mr-4 inline-block size-10 object-contain"
      />
      {children ?? t.meeting.heading}
    </h2>
  )
}

// Left out when the installation has no contact link
export function ContactButton(props: Pick<ButtonProps, "variant" | "className">) {
  const { t } = useI18n()
  const { contact } = useBusiness()
  if (!contact) return null

  return (
    <Button asChild {...props}>
      <a href={contact} target="_blank" rel="noopener noreferrer">
        {t.meeting.contact} <ExternalLink />
        <span className="sr-only">{t.common.opensInNewTab}</span>
      </a>
    </Button>
  )
}

export default function MeetingPicker({ data }: IProps) {
  const { language, t } = useI18n()
  const { contact } = useBusiness()
  const locale = useFormattingLocale()
  const [slotDurationMins, setSlotDurationMins] = useState<number | null>(null)
  const [loadingState, setLoadingState] = useState<LoadingState>(LoadingState.Loading)
  const { closed, setClosed } = useChatStore()
  const [slot, setSlot] = useState<[DateTime | null, DateTime | null]>([null, null])
  const [dialogOpen, setDialogOpen] = useState(false)
  const [formState, setFormState] = useState<FormState>(FormState.Idle)
  const [availableSlots, setAvailableSlots] = useState<DateTime[]>([])
  const [bookedEmail, setBookedEmail] = useState("")
  // Whether the time the visitor last tried to book could no longer be booked, until they pick another
  const [slotUnavailable, setSlotUnavailable] = useState(false)

  const onSlotChanged = useCallback((slot: [DateTime | null, DateTime | null]) => {
    setSlot(slot)
    if (slot.every((s) => s !== null)) {
      setSlotUnavailable(false)
      setDialogOpen(true)
    }
  }, [])

  // A new card payload reloads availability, so show the loading state again instead of the previous result
  const [loadedData, setLoadedData] = useState(data)
  if (loadedData !== data) {
    setLoadedData(data)
    setLoadingState(LoadingState.Loading)
  }

  const latestRequest = useRef(0)
  const cardRef = useRef<HTMLDivElement>(null)
  const headingId = useId()
  const bookedDetailsId = useId()

  // Errors while processing the slots also show the error state, so the card never stays stuck loading.
  // Only the latest request updates the card, so a slower earlier response can't overwrite a newer one.
  const loadAvailability = useCallback(() => {
    const request = ++latestRequest.current
    return getAvailability()
      .then(({ slots, meetingDurationMins }) => {
        if (request !== latestRequest.current) return
        setAvailableSlots(slots.map((slot) => (slot?.start ? DateTime.fromSeconds(slot.start) : null)).filter((s) => s !== null))
        setSlotDurationMins(meetingDurationMins || null)
        setLoadingState(LoadingState.Idle)
      })
      .catch((e) => {
        if (request !== latestRequest.current) return
        console.error("Error getting availability", e)
        setLoadingState(LoadingState.Error)
      })
  }, [])

  useEffect(() => {
    if (data) loadAvailability()
  }, [data, loadAvailability])

  // A time taken meanwhile, or now too soon to book, can't be booked by trying again: the dialog closes and the picker shows
  // the times still free, with a notice to pick another
  function onSlotUnavailable() {
    setDialogOpen(false)
    setSlot([null, null])
    setSlotUnavailable(true)
    setLoadingState(LoadingState.Loading)
    loadAvailability()
  }

  // The dialog that had focus is gone, so focus goes to the card, which the notice then follows
  useEffect(() => {
    if (slotUnavailable) cardRef.current?.focus()
  }, [slotUnavailable])

  function retryAvailability() {
    // The Try again button disappears while loading, so keep keyboard focus on the card
    cardRef.current?.focus()
    setLoadingState(LoadingState.Loading)
    loadAvailability()
  }

  // Focus the confirmation so it's announced with its details: the dialog that had focus is gone, and the closed
  // conversation leaves focus alone when it's already somewhere useful
  useEffect(() => {
    if (formState === FormState.Success) {
      cardRef.current?.focus()
      setClosed(true)
    }
  }, [formState, setClosed])

  // Throws rather than returning without a time, which the dialog would report as booked
  async function onBookEvent(formData: SlotPickerDataType) {
    if (slot.some((s) => s === null)) throw new Error("No meeting time to book")
    await addBooking({
      threadId: data.threadId,
      data: {
        ...formData,
        slot: [slot[0]!.toUnixInteger(), slot[1]!.toUnixInteger()],
        timeZone: slot[0]!.zoneName ?? undefined,
        // The confirmation saved on the thread shows the time as the visitor saw it
        locale,
      },
      deleteMessageId: data.deleteMessageId,
      language,
    })
    setBookedEmail(formData.email)
  }

  const booked = formState === FormState.Success && slot.every((s) => s !== null)

  // Announced from a status region that stays mounted, since screen readers skip regions inserted with their content.
  // The booking confirmation is announced by focusing the card instead
  const availabilityStatus = booked
    ? ""
    : {
        [LoadingState.Loading]: t.meeting.loadingStatus,
        [LoadingState.Idle]: availableSlots.length ? t.meeting.loadedStatus : t.meeting.noTimesStatus,
        // The error message announces itself as an alert
        [LoadingState.Error]: "",
      }[loadingState]

  // Once the conversation is closed some other way, e.g. by an enquiry sent from the handoff card of the same message, there's
  // nothing left to book: the agents API would refuse it as already closed
  if (closed && !booked) return null

  return (
    <div
      ref={cardRef}
      tabIndex={-1}
      // Named by its heading so moving focus here after Try again or booking announces the card, with the booking's details
      role="group"
      aria-labelledby={headingId}
      aria-describedby={booked ? bookedDetailsId : undefined}
      className={clsx("border-primary/30 bg-primary/10 focus-visible:ring-ring w-full rounded-md border p-2 outline-none focus-visible:ring-2")}
    >
      <p role="status" className="sr-only">
        {availabilityStatus}
      </p>
      {/* Shown whatever the availability does afterwards, e.g. reloading for a new card payload */}
      {booked && (
        <>
          <Heading id={headingId}>{t.meeting.bookedHeading}</Heading>
          <div id={bookedDetailsId}>
            <div className="flex items-start gap-x-2 pb-1 text-sm">
              <CalendarCheck className="shrink-0 text-green-700" size={20} />
              <div>{formatSlot(slot as [DateTime, DateTime], locale)}</div>
            </div>
            <div className="flex gap-x-2 pb-1 text-sm">
              <Globe className="shrink-0" size={20} />
              <div>{slot[0]!.zoneName}</div>
            </div>
            <div className="flex gap-x-2 pb-6 text-sm">
              <Mail className="shrink-0" size={20} />
              <div className="min-w-0 break-words">
                {t.meeting.invitationBefore}
                <strong>{bookedEmail}</strong>
                {t.meeting.invitationAfter}
              </div>
            </div>
            <p className="border-primary/30 border-t pt-4 text-sm">{contact ? t.meeting.closedNote : t.meeting.closedNoteWithoutContact}</p>
          </div>
          <ContactButton variant="outline" className="mt-4" />
        </>
      )}
      {!booked && loadingState === LoadingState.Loading && (
        <>
          <Heading id={headingId} />
          <div className="flex gap-x-2 pb-1">
            <CalendarClock size={20} />
            <Skeleton className="h-5 w-50" />
          </div>
          <div className="flex gap-x-2">
            <Globe size={20} />
            <div>{localTimeZone}</div>
          </div>
          <div className="my-6 flex flex-col gap-x-6 lg:flex-row">
            <Skeleton className="h-[250px] w-full lg:h-[350px] lg:w-1/2" />
            <Skeleton className="hidden h-[350px] w-1/2 lg:block" />
          </div>
        </>
      )}
      {!booked && loadingState === LoadingState.Error && (
        <>
          <Heading id={headingId} />
          <div className="py-6 text-center text-sm">
            <AlertCircle className="animate-jump-in animate-once mx-auto mb-4 block text-red-700" size={40} />
            <p role="alert" className="text-red-700">
              {t.meeting.loadFailed}
            </p>
            <div className="mt-6 flex flex-wrap items-center justify-center gap-2">
              <Button onClick={retryAvailability}>
                <RotateCw /> {t.meeting.tryAgain}
              </Button>
              <ContactButton variant="outline" />
            </div>
          </div>
        </>
      )}
      {loadingState === LoadingState.Idle && (
        <>
          {formState === FormState.Idle && (
            <>
              <Heading id={headingId} />
              {slotUnavailable && (
                <p role="alert" className="pb-2 text-sm text-red-700">
                  {t.meeting.slotUnavailable}
                </p>
              )}
              {availableSlots.length === 0 ? (
                <div className="py-6 text-center text-sm">
                  <CalendarX className="mx-auto mb-4 block text-slate-500" size={40} />
                  <p>{t.meeting.noTimes}</p>
                  {/* Without a contact link there is no one to get in touch with here */}
                  <p className="text-slate-600">{contact ? t.meeting.getInTouch : t.meeting.checkBackLater}</p>
                  <ContactButton className="mt-6" />
                </div>
              ) : (
                <>
                  {slotDurationMins ? (
                    <div className="flex gap-x-2 pb-1 text-sm">
                      <CalendarClock size={20} />
                      <div>{t.meeting.duration(slotDurationMins)}</div>
                    </div>
                  ) : null}
                  <div className="flex gap-x-2 pb-6 text-sm">
                    <Globe size={20} />
                    <div>{localTimeZone}</div>
                  </div>
                  <SlotPicker value={slot} onChange={onSlotChanged} availableSlots={availableSlots} slotDurationMins={slotDurationMins || 0} />
                  {slot.every((s) => s !== null) && (
                    <BookFormDialog
                      open={dialogOpen}
                      onOpenChange={setDialogOpen}
                      slot={slot as [DateTime, DateTime]}
                      data={data}
                      onBookEvent={onBookEvent}
                      onStateChange={setFormState}
                      onSlotUnavailable={onSlotUnavailable}
                    />
                  )}
                </>
              )}
            </>
          )}
        </>
      )}
    </div>
  )
}
