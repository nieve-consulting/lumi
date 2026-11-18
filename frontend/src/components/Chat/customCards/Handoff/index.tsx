import { useEffect, useId, useRef, useState } from "react"
import type { HandoffCardPayload } from "@lumi/shared-contracts/handoff"
import { CheckCircle2, ExternalLink, Send } from "lucide-react"

import { useBusiness } from "@/lib/BusinessProvider"
import { useI18n } from "@/lib/i18n/LanguageProvider"
import { Button } from "@/components/ui/button"

import { useChatStore } from "../../store/store"
import { ContactButton } from "../MeetingPicker"
import EnquiryForm from "./EnquiryForm"

interface IProps {
  data: HandoffCardPayload
  // The same message shows the meeting picker, so the enquiry is offered as the alternative to picking a time
  alongsidePicker?: boolean
}

// The booking page's site as visitors know it, e.g. calendly.com, or null for anything but a web address
function webHost(url: string) {
  try {
    const parsed = new URL(url)
    return parsed.protocol === "https:" || parsed.protocol === "http:" ? parsed.hostname.replace(/^www\./, "") : null
  } catch {
    return null
  }
}

// Opens the business's booking page. The booking happens there, so the chat never shows it as booked or closes the
// conversation
function BookingLink({ booking, headingId }: { booking: NonNullable<HandoffCardPayload["booking"]>; headingId: string }) {
  const { t } = useI18n()
  const host = webHost(booking.url)
  if (!host) return null

  return (
    <div>
      <h2 id={headingId} className="mb-1 text-lg font-bold">
        {t.handoff.bookingHeading}
      </h2>
      <p className="mb-3 text-sm text-slate-700">{t.handoff.bookingNote(host)}</p>
      {/* Wraps a long label in the widget's narrow iframe */}
      <Button asChild className="h-auto min-h-10 text-left whitespace-normal">
        <a href={booking.url} target="_blank" rel="noopener noreferrer">
          {booking.label || t.handoff.book} <ExternalLink aria-hidden />
          <span className="sr-only">{t.common.opensInNewTab}</span>
        </a>
      </Button>
    </div>
  )
}

// What the business offers once the visitor wants to take things further: its booking page, its enquiry form, or both
export default function Handoff({ data, alongsidePicker }: IProps) {
  const { t } = useI18n()
  const { contact } = useBusiness()
  const { threadId, closed, setClosed } = useChatStore()
  // undefined until the enquiry is delivered, then where the team will reply
  const [replyTo, setReplyTo] = useState<string | null>()
  const delivered = replyTo !== undefined
  const booking = data.booking && webHost(data.booking.url) ? data.booking : undefined
  // Shown straight away when it's all the card offers; otherwise once the visitor chooses it
  const [formShown, setFormShown] = useState(!booking && !alongsidePicker)
  const cardRef = useRef<HTMLDivElement>(null)
  const formHeadingRef = useRef<HTMLHeadingElement>(null)
  const headingId = useId()
  const sentDetailsId = useId()
  // Only the visitor's own conversation sends: the admin's view of it shows the card as the visitor saw it
  const readOnly = threadId !== data.threadId

  // Focus the confirmation so it's announced with its details: the form that had focus is gone
  useEffect(() => {
    if (delivered) {
      cardRef.current?.focus()
      setClosed(true)
    }
  }, [delivered, setClosed])

  // The conversation was closed some other way, e.g. by booking a time in the meeting picker of the same message
  if (closed && !delivered && !readOnly) return null
  if (!booking && !data.enquiry) return null

  function showForm() {
    setFormShown(true)
    requestAnimationFrame(() => formHeadingRef.current?.focus())
  }

  // The card is named by its first heading
  const enquiryHeadingId = booking ? undefined : headingId
  const HeadingTag = booking ? "h3" : "h2"

  return (
    <div
      ref={cardRef}
      tabIndex={-1}
      role="group"
      aria-labelledby={headingId}
      aria-describedby={delivered ? sentDetailsId : undefined}
      className="border-primary/30 bg-primary/10 focus-visible:ring-ring w-full min-w-0 rounded-md border p-3 outline-none focus-visible:ring-2"
    >
      {delivered ? (
        <>
          <h2 id={headingId} className="mb-2 flex items-center gap-2 text-lg font-bold">
            <CheckCircle2 className="shrink-0 text-green-700" size={22} aria-hidden />
            {t.handoff.sentHeading}
          </h2>
          <div id={sentDetailsId} className="text-sm">
            <p className="pb-4 break-words">
              {replyTo ? (
                <>
                  {t.handoff.sentBefore}
                  <strong>{replyTo}</strong>
                  {t.handoff.sentAfter}
                </>
              ) : (
                t.handoff.sent
              )}
            </p>
            <p className="border-primary/30 border-t pt-4">{contact ? t.handoff.closedNote : t.handoff.closedNoteWithoutContact}</p>
          </div>
          <ContactButton variant="outline" className="mt-4" />
        </>
      ) : (
        <>
          {booking && <BookingLink booking={booking} headingId={headingId} />}
          {data.enquiry && (
            <div className={booking ? "border-primary/30 mt-4 border-t pt-4" : undefined}>
              {formShown ? (
                <>
                  <HeadingTag
                    ref={formHeadingRef}
                    id={enquiryHeadingId}
                    tabIndex={-1}
                    className={`mb-2 font-bold outline-none ${booking ? "text-base" : "text-lg"}`}
                  >
                    {t.handoff.enquiryHeading}
                  </HeadingTag>
                  <EnquiryForm
                    threadId={data.threadId}
                    messageId={data.messageId}
                    enquiry={data.enquiry}
                    readOnly={readOnly}
                    onDelivered={setReplyTo}
                  />
                </>
              ) : (
                <>
                  <HeadingTag id={enquiryHeadingId} className="mb-3 text-base font-semibold">
                    {t.handoff.alternative}
                  </HeadingTag>
                  <Button variant="outline" onClick={showForm}>
                    <Send aria-hidden /> {t.handoff.showForm}
                  </Button>
                </>
              )}
            </div>
          )}
        </>
      )}
    </div>
  )
}
