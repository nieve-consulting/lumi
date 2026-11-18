import { useMemo, useRef, useState } from "react"
import { zodResolver } from "@hookform/resolvers/zod"
import {
  ENQUIRY_FIELDS,
  ENQUIRY_LIMITS,
  enquiryDataSchema,
  randomUuid,
  type EnquiryData,
  type EnquiryField,
  type HandoffCardPayload,
  type HandoffSettingsProblem,
} from "@lumi/shared-contracts/handoff"
import { Loader2 } from "lucide-react"
import { useForm, type FieldPath } from "react-hook-form"
import type { z } from "zod"

import { useBusiness } from "@/lib/BusinessProvider"
import { useI18n } from "@/lib/i18n/LanguageProvider"
import { addEnquiry } from "@/lib/threads"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"

type Enquiry = NonNullable<HandoffCardPayload["enquiry"]>

// Why the last send didn't deliver the enquiry. failed: no delivery channel accepted it, but it's saved and can be sent
// again. error: the agents API couldn't be reached or answered unexpectedly. invalid: problems the form can't show by field.
// rate_limited: too many requests from the visitor's address, so sending again works after a wait
type Outcome = "failed" | "error" | "invalid" | "closed" | "unavailable" | "rate_limited"

const INPUT_TYPES: Record<EnquiryField, { type: string; autoComplete: string }> = {
  name: { type: "text", autoComplete: "name" },
  email: { type: "email", autoComplete: "email" },
  phone: { type: "tel", autoComplete: "tel" },
  company: { type: "text", autoComplete: "organization" },
}

interface IProps {
  threadId: string
  messageId: string
  enquiry: Enquiry
  // Shown without sending, e.g. in the admin's view of the conversation
  readOnly?: boolean
  // Where the team will reply: the email or else the phone number the visitor sent
  onDelivered: (replyTo: string | null) => void
}

// The submission id of a card's enquiry, kept for the browser session so sending again after a reload still never creates a
// second enquiry. Storage can be unavailable, e.g. blocked in a third-party iframe: the id then lasts while the card does
const submissionKey = (threadId: string, messageId: string) => `lumi-enquiry:${threadId}:${messageId}`

function storedSubmissionId(key: string) {
  try {
    const saved = sessionStorage.getItem(key)
    if (saved) return saved
  } catch {}
  const id = randomUuid()
  try {
    sessionStorage.setItem(key, id)
  } catch {}
  return id
}

function forgetSubmissionId(key: string) {
  try {
    sessionStorage.removeItem(key)
  } catch {}
}

// The fields of the card's data that an API problem can name, e.g. "contact.email" or "answers.1"
function problemField(field: string, enquiry: Enquiry): FieldPath<EnquiryData> | undefined {
  const contact = /^contact\.(\w+)$/.exec(field)?.[1]
  if (contact && (ENQUIRY_FIELDS as readonly string[]).includes(contact) && enquiry.fields[contact as EnquiryField] !== "off") {
    return `contact.${contact as EnquiryField}`
  }
  const answer = /^answers\.(\d+)$/.exec(field)?.[1]
  if (answer !== undefined && Number(answer) < enquiry.qualification.length) return `answers.${Number(answer)}`
  return field === "message" ? "message" : undefined
}

function OptionalMark() {
  const { t } = useI18n()
  return <span className="font-normal text-slate-500">{t.common.optional}</span>
}

// The text of an outcome, with the contact link when the installation has one. retryAfterSeconds: how long to wait after
// too many requests, when known
function OutcomeMessage({ outcome, retryAfterSeconds }: { outcome: Outcome; retryAfterSeconds?: number }) {
  const { t } = useI18n()
  const { contact } = useBusiness()
  const link = contact ? (
    <a href={contact} target="_blank" rel="noopener noreferrer" className="underline">
      {t.handoff.contactLink}
      <span className="sr-only"> {t.common.opensInNewTab}</span>
    </a>
  ) : null

  switch (outcome) {
    case "failed":
      return link ? (
        <>
          {t.handoff.failedBefore}
          {link}
          {t.handoff.failedAfter}
        </>
      ) : (
        t.handoff.failedWithoutContact
      )
    case "closed":
      return link ? (
        <>
          {t.handoff.closedBefore}
          {link}
          {t.handoff.failedAfter}
        </>
      ) : (
        t.handoff.closedWithoutContact
      )
    case "unavailable":
      return link ? (
        <>
          {t.handoff.unavailableBefore}
          {link}
          {t.handoff.failedAfter}
        </>
      ) : (
        t.handoff.unavailableWithoutContact
      )
    case "rate_limited": {
      const minutes = retryAfterSeconds && Math.ceil(retryAfterSeconds / 60)
      return link ? (
        <>
          {t.common.tooManyRequestsBefore(minutes)}
          {link}
          {t.handoff.failedAfter}
        </>
      ) : (
        t.common.tooManyRequests(minutes)
      )
    }
    case "invalid":
      return t.handoff.invalid
    case "error":
      return t.handoff.error
  }
}

// The enquiry the visitor sends to the business: the contact fields the business asks for, prefilled from the conversation,
// the answers to its qualification questions and what they'd like to discuss, all editable before sending
export default function EnquiryForm({ threadId, messageId, enquiry, readOnly, onDelivered }: IProps) {
  const { language, t } = useI18n()
  const fields = ENQUIRY_FIELDS.filter((field) => enquiry.fields[field] !== "off")
  // The form edits the same shape it sends
  const schema = useMemo(
    () => enquiryDataSchema(enquiry.fields, enquiry.qualification.length, t.handoff.validation) as z.ZodType<EnquiryData, EnquiryData>,
    [enquiry.fields, enquiry.qualification.length, t]
  )
  const form = useForm<EnquiryData, unknown, EnquiryData>({
    resolver: zodResolver(schema),
    defaultValues: {
      contact: Object.fromEntries(fields.map((field) => [field, enquiry.values[field] ?? ""])),
      answers: enquiry.qualification.map(({ answer }) => answer),
      message: enquiry.message,
    },
    mode: "onTouched",
  })
  const [sending, setSending] = useState(false)
  const [outcome, setOutcome] = useState<Outcome>()
  const [retryAfterSeconds, setRetryAfterSeconds] = useState<number>()
  // Made on the first send and kept for every retry of this card, so sending again never creates a second enquiry
  const submissionId = useRef<string | null>(null)
  const sendingRef = useRef(false)

  async function onSubmit(data: EnquiryData) {
    if (sendingRef.current || readOnly) return
    sendingRef.current = true
    setSending(true)
    setOutcome(undefined)
    const key = submissionKey(threadId, messageId)
    try {
      // Inside the try, so a failure here reports an error rather than leaving the form sending
      submissionId.current ??= storedSubmissionId(key)
      const result = await addEnquiry({ threadId, messageId, submissionId: submissionId.current, data, language })
      if (result.status === "delivered") {
        forgetSubmissionId(key)
        // Where the team will reply as it received the enquiry, which an earlier delivery may have sent with other details
        onDelivered(result.replyTo)
      } else if (result.status === "invalid") {
        showProblems(result.problems)
      } else {
        setRetryAfterSeconds(result.status === "rate_limited" ? result.retryAfterSeconds : undefined)
        setOutcome(result.status)
      }
    } catch (error) {
      console.error("Sending the enquiry failed", error)
      setOutcome("error")
    } finally {
      sendingRef.current = false
      setSending(false)
    }
  }

  // Shows the API's problems next to their fields, or as a whole when it names none of them
  function showProblems(problems: HandoffSettingsProblem[]) {
    const shown = problems.flatMap(({ field, message }) => {
      const name = problemField(field, enquiry)
      if (!name) return []
      form.setError(name, { message })
      return [name]
    })
    if (shown.length) form.setFocus(shown[0])
    else setOutcome("invalid")
  }

  const retry = outcome === "failed" || outcome === "error" || outcome === "rate_limited"

  return (
    <Form {...form}>
      <form noValidate onSubmit={(event) => form.handleSubmit(onSubmit)(event)} className="space-y-4">
        {/* Stays mounted so screen readers announce it; the outcome announces itself as an alert */}
        <p role="status" className="sr-only">
          {sending ? t.handoff.sendingStatus : ""}
        </p>
        <p className="text-sm text-slate-700">{t.handoff.sharedNote}</p>
        {/* Sent with the enquiry, so shown too, though the visitor can't change it */}
        {enquiry.topic && (
          <p className="text-sm break-words">
            <span className="font-medium">{t.handoff.subject}</span> {enquiry.topic}
          </p>
        )}
        <fieldset disabled={readOnly} className="min-w-0 space-y-4">
          {fields.map((field) => (
            <FormField
              key={field}
              control={form.control}
              name={`contact.${field}`}
              render={({ field: input }) => (
                <FormItem>
                  <FormLabel>
                    {t.handoff[field]} {enquiry.fields[field] === "optional" && <OptionalMark />}
                  </FormLabel>
                  <FormControl>
                    <Input
                      {...input}
                      value={input.value ?? ""}
                      {...INPUT_TYPES[field]}
                      maxLength={ENQUIRY_LIMITS[field]}
                      aria-required={enquiry.fields[field] === "required" || undefined}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          ))}
          {enquiry.qualification.map(({ question }, index) => (
            <FormField
              key={index}
              control={form.control}
              name={`answers.${index}`}
              render={({ field: input }) => (
                <FormItem>
                  <FormLabel className="leading-snug">
                    {question} <OptionalMark />
                  </FormLabel>
                  <FormControl>
                    <Textarea {...input} rows={2} maxLength={ENQUIRY_LIMITS.answer} className="min-h-[60px]" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          ))}
          <FormField
            control={form.control}
            name="message"
            render={({ field: input }) => (
              <FormItem>
                <FormLabel>
                  {t.handoff.message} <OptionalMark />
                </FormLabel>
                <FormControl>
                  <Textarea {...input} rows={4} maxLength={ENQUIRY_LIMITS.message} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </fieldset>
        {outcome && (
          <p role="alert" className="text-sm text-red-700">
            <OutcomeMessage outcome={outcome} retryAfterSeconds={retryAfterSeconds} />
          </p>
        )}
        {/* Not when sending can't work: the contact link is the next step */}
        {!readOnly && outcome !== "closed" && outcome !== "unavailable" && (
          <div className="flex justify-end">
            {/* aria-disabled rather than disabled while sending, so keyboard focus stays on the button */}
            <Button
              type="submit"
              aria-disabled={sending || undefined}
              className={cn(sending && "cursor-progress opacity-70")}
              onClick={(event) => sending && event.preventDefault()}
            >
              {sending ? (
                <>
                  <Loader2 className="animate-spin" aria-hidden /> {t.handoff.submitting}
                </>
              ) : retry ? (
                t.handoff.tryAgain
              ) : (
                t.handoff.submit
              )}
            </Button>
          </div>
        )}
      </form>
    </Form>
  )
}
