"use client"

import { useEffect, useRef, useState } from "react"
import Link from "next/link"
import type { HandoffSettings } from "@/generated/graphql"
import {
  DELIVERY_CHANNEL_LABELS,
  ENQUIRY_FIELD_LABELS,
  ENQUIRY_FIELDS,
  MAX_DELIVERY_CHANNELS,
  MAX_EMAIL_RECIPIENTS,
  MAX_QUALIFICATION_QUESTIONS,
  MAX_QUESTION_LENGTH,
  MIN_WEBHOOK_SECRET_LENGTH,
  type BookingType,
  type DeliveryChannelType,
  type EnquiryField,
  type FieldMode,
} from "@lumi/shared-contracts/handoff"
import { ArrowDown, ArrowUp, CalendarDays, Inbox, KeyRound, ListChecks, Mail, Plus, Trash2, Webhook } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { useToast } from "@/components/ui/use-toast"
import {
  CompactFieldsContext,
  describedBy,
  FieldError,
  FieldHint,
  FieldLabel,
  SelectField,
  TextAreaField,
  TextField,
} from "@/components/BusinessSettings/fields"
import { fieldId, type FieldErrors } from "@/components/BusinessSettings/form"

import { useLeaveWarning } from "../useLeaveWarning"
import { updateHandoff } from "./actions"
import {
  errorsFromProblems,
  formFromSettings,
  generateSecret,
  graphQLInput,
  newChannel,
  newQuestion,
  validateForm,
  type ChannelForm,
  type HandoffForm,
} from "./form"

interface IProps {
  // The stored settings, or their defaults until first saved
  settings: HandoffSettings
  // The business's contact link, which visitors get when nothing else is set up
  contact?: string
}

const SECTIONS = [
  {
    id: "questions",
    icon: ListChecks,
    title: "Qualification questions",
    description: "What the assistant asks prospects before suggesting the next step.",
    fields: ["qualificationQuestions"],
  },
  {
    id: "booking",
    icon: CalendarDays,
    title: "Booking",
    description: "Where visitors book a meeting with your team.",
    fields: ["booking"],
  },
  {
    id: "enquiry",
    icon: Inbox,
    title: "Enquiries",
    description: "The details visitors send when they'd rather be contacted, and where your team receives them.",
    fields: ["enquiryEnabled", "enquiryFields", "channels"],
  },
] as const

const MODE_OPTIONS: { value: FieldMode; label: string }[] = [
  { value: "off", label: "Off" },
  { value: "optional", label: "Optional" },
  { value: "required", label: "Required" },
]

const BOOKING_OPTIONS: { value: BookingType; label: string; description: string }[] = [
  { value: "none", label: "No booking", description: "The assistant doesn't offer to book a meeting." },
  {
    value: "link",
    label: "Booking page",
    description: "A button that opens your own booking page, e.g. Calendly or a Google Calendar appointment page. Visitors book there.",
  },
  {
    value: "calendar",
    label: "In-chat calendar",
    description: "Visitors pick a time in the chat and get a Google Calendar invitation.",
  },
]

const CHANNEL_UNAVAILABLE: Record<DeliveryChannelType, string> = {
  email: "This server can't send email: it has no sender address (EMAIL_FROM). Ask whoever runs Lumi to set it.",
  webhook: "This server can't deliver to webhooks.",
}

const plural = (count: number, one: string, many: string) => `${count} ${count === 1 ? one : many}`

function host(url: string) {
  try {
    return new URL(url.trim()).hostname.replace(/^www\./, "")
  } catch {
    return undefined
  }
}

// "your email (required), name and phone (optional)"
function describeFields(form: HandoffForm) {
  const list = (fields: EnquiryField[]) =>
    fields.length > 1
      ? `${fields
          .slice(0, -1)
          .map((field) => ENQUIRY_FIELD_LABELS[field].toLowerCase())
          .join(", ")} and ${ENQUIRY_FIELD_LABELS[fields.at(-1)!].toLowerCase()}`
      : ENQUIRY_FIELD_LABELS[fields[0]].toLowerCase()
  const required = ENQUIRY_FIELDS.filter((field) => form.fields[field] === "required")
  const optional = ENQUIRY_FIELDS.filter((field) => form.fields[field] === "optional")
  return [required.length ? `${list(required)} (required)` : "", optional.length ? `${list(optional)} (optional)` : ""].filter(Boolean).join(", ")
}

// What visitors who want to take things further get with these settings, in plain words
// available: the channel types this server can deliver with
function visitorOutcome(form: HandoffForm, contact: string | undefined, available: string[]) {
  const lines: string[] = []
  // The chat offers the enquiry form only while enquiries are on and at least one channel can send from this server
  const configured = form.enquiryEnabled && form.channels.length > 0
  const enquiries = configured && form.channels.some(({ type }) => available.includes(type))
  if (form.bookingType === "calendar") lines.push("They pick a time in the chat and get a calendar invitation.")
  if (form.bookingType === "link") {
    const site = host(form.bookingUrl) ?? "your booking page"
    lines.push(
      `They get a “${form.bookingLabel.trim() || "Book a time"}” button that opens ${site}. They book there, so the chat can't confirm the booking and the conversation stays open.`
    )
  }
  if (enquiries) {
    lines.push(
      `${form.bookingType === "none" ? "They" : "Or they"} send an enquiry with their ${describeFields(form)}${
        form.questions.some(({ text }) => text.trim()) ? ", their answers to your questions" : ""
      } and what they'd like to discuss. Once a delivery channel accepts it, the conversation closes.`
    )
  } else if (configured) {
    lines.push(
      "None of your delivery channels can send from this server (email needs EMAIL_FROM), so visitors aren't offered the enquiry form until whoever runs Lumi fixes it."
    )
  } else if (form.enquiryEnabled) {
    lines.push("Enquiries are on but have no delivery channel, so visitors can't send them yet.")
  }
  if (form.bookingType === "none" && !enquiries) {
    lines.push(
      contact
        ? `Nothing is set up, so the assistant points them to your contact link: ${contact}`
        : "Nothing is set up and there's no contact link, so the assistant tells them the team can't be reached from the chat. Add a contact page or email in Business identity."
    )
  }
  const questions = form.questions.filter(({ text }) => text.trim()).length
  if (questions)
    lines.unshift(`Before suggesting the next step, the assistant works your ${plural(questions, "question", "questions")} into the conversation.`)
  return lines
}

type Failure = { message: string }

export default function HandoffSettingsForm({ settings, contact }: IProps) {
  const { toast } = useToast()
  const [initial] = useState(() => formFromSettings(settings))
  const [form, setForm] = useState<HandoffForm>(initial)
  const [savedForm, setSavedForm] = useState<HandoffForm>(initial)
  const [available, setAvailable] = useState(settings.availableChannelTypes)
  const [active, setActive] = useState<string>("questions")
  const headingRef = useRef<HTMLHeadingElement>(null)
  const sectionRef = useRef<HTMLElement>(null)
  // Bumped to move focus to the first problem once the section showing it has rendered
  const [focusRequest, setFocusRequest] = useState(0)
  const [errors, setErrors] = useState<FieldErrors>({})
  const [saving, setSaving] = useState(false)
  const [failure, setFailure] = useState<Failure>()
  // Webhooks whose secret was generated here, so the form asks to copy it before saving
  const [generated, setGenerated] = useState<Set<string>>(() => new Set())

  const dirty = JSON.stringify(form) !== JSON.stringify(savedForm)
  const section = SECTIONS.find(({ id }) => id === active) ?? SECTIONS[0]

  useLeaveWarning(dirty, "Leave without saving your enquiry and booking settings? Your changes will be lost.")

  function update(patch: Partial<HandoffForm>) {
    const next = { ...form, ...patch }
    setForm(next)
    // Problems already shown clear as they're fixed
    if (Object.keys(errors).length) {
      const current = validateForm(next)
      setErrors(Object.fromEntries(Object.entries(current).filter(([field]) => field in errors)))
    }
  }

  const updateChannel = (index: number, patch: Partial<ChannelForm>) =>
    update({ channels: form.channels.map((channel, current) => (current === index ? { ...channel, ...patch } : channel)) })

  // Shows the problems, switching to the section of the first, and asks for focus to move to it
  function showProblems(problems: FieldErrors) {
    setErrors(problems)
    const [first] = Object.keys(problems)
    const owner = SECTIONS.find(({ fields }) => fields.some((field) => first === field || first?.startsWith(`${field}.`)))
    if (owner) setActive(owner.id)
    setFocusRequest((request) => request + 1)
  }

  // After the section has rendered the problems (and any channel editors they reveal): the first invalid field in reading
  // order, else an add-channel button when a channel is missing, else the section's heading
  useEffect(() => {
    if (!focusRequest) return
    const frame = requestAnimationFrame(() =>
      (
        sectionRef.current?.querySelector<HTMLElement>('[aria-invalid="true"]') ??
        sectionRef.current?.querySelector<HTMLElement>("[data-add-channel]:not(:disabled)") ??
        headingRef.current
      )?.focus()
    )
    return () => cancelAnimationFrame(frame)
  }, [focusRequest])

  async function save() {
    if (saving || !dirty) return
    setFailure(undefined)
    let problems: FieldErrors
    try {
      problems = validateForm(form)
    } catch (error) {
      // Not a problem with the settings, so it's shown rather than left as a save that silently does nothing
      console.error("Checking the handoff settings failed", error)
      return setFailure({ message: "The settings couldn't be checked. Reload the page and try again." })
    }
    if (Object.keys(problems).length) return showProblems(problems)

    setSaving(true)
    try {
      const result = await updateHandoff(graphQLInput(form))
      if (result.ok) {
        // With the keys of new channels and the secrets just saved redacted
        const saved = formFromSettings(result.settings)
        setForm(saved)
        setSavedForm(saved)
        setAvailable(result.settings.availableChannelTypes)
        setGenerated(new Set())
        setErrors({})
        toast({ title: "Enquiry and booking settings saved", description: "New conversations use them within a minute." })
      } else if ("problems" in result) {
        showProblems(errorsFromProblems(result.problems, form))
      } else {
        setFailure({ message: result.error })
      }
    } catch (error) {
      console.error("Saving the handoff settings failed", error)
      setFailure({ message: "The settings couldn't be saved. Try again in a moment." })
    } finally {
      setSaving(false)
    }
  }

  const problemCount = Object.keys(errors).length
  const outcome = visitorOutcome(form, contact, available)

  return (
    <form
      noValidate
      className="space-y-5"
      onSubmit={(event) => {
        event.preventDefault()
        save()
      }}
    >
      {problemCount > 0 && (
        <p role="alert" className="text-sm font-medium text-red-700">
          {problemCount === 1 ? "One setting needs fixing." : `${problemCount} settings need fixing.`}
        </p>
      )}
      {/* Not a live region: it follows the settings below as they change */}
      <section aria-labelledby="handoff-outcome-heading" className="rounded-md border border-slate-200 bg-slate-50 p-4 text-sm text-slate-700">
        <h2 id="handoff-outcome-heading" className="mb-1 font-semibold text-slate-900">
          What visitors see when they want to talk to your team
        </h2>
        <ul className="list-disc space-y-1 pl-5">
          {outcome.map((line) => (
            <li key={line} className="break-words">
              {line}
            </li>
          ))}
        </ul>
        {dirty && <p className="mt-2 text-xs text-slate-600">Includes your unsaved changes.</p>}
      </section>
      <div className="flex flex-col gap-5 xl:flex-row xl:gap-8">
        <nav aria-label="Enquiry and booking settings sections" className="flex gap-1 overflow-x-auto pb-1 xl:w-48 xl:shrink-0 xl:flex-col">
          {SECTIONS.map(({ id, title, icon: Icon, fields }) => {
            const count = Object.keys(errors).filter((error) => fields.some((field) => error === field || error.startsWith(`${field}.`))).length
            return (
              <button
                key={id}
                type="button"
                aria-current={id === active ? "page" : undefined}
                className={`flex items-center gap-2 rounded-md px-3 py-2 text-left text-sm font-medium whitespace-nowrap focus-visible:outline-2 focus-visible:outline-blue-700 ${id === active ? "bg-blue-50 text-blue-800" : "text-slate-600 hover:bg-slate-50"}`}
                onClick={() => {
                  setActive(id)
                  requestAnimationFrame(() => headingRef.current?.focus())
                }}
              >
                <Icon size={16} aria-hidden className="shrink-0" />
                {title}
                {count > 0 && <span className="text-red-700">({count})</span>}
              </button>
            )
          })}
        </nav>
        <section ref={sectionRef} aria-labelledby="handoff-section-heading" className="min-w-0 flex-1">
          <div className="mb-6">
            <h2 ref={headingRef} tabIndex={-1} id="handoff-section-heading" className="flex items-center gap-2 text-lg font-semibold outline-none">
              <span className="rounded-md bg-blue-50 p-1.5 text-blue-700">
                <section.icon size={18} aria-hidden />
              </span>
              {section.title}
            </h2>
            <p className="text-sm text-slate-600">{section.description}</p>
          </div>
          <CompactFieldsContext.Provider value={true}>
            <fieldset disabled={saving} className="min-w-0 space-y-6">
              {active === "questions" && <QuestionsSection form={form} update={update} errors={errors} />}
              {active === "booking" && <BookingSection form={form} update={update} errors={errors} />}
              {active === "enquiry" && (
                <EnquirySection
                  form={form}
                  update={update}
                  updateChannel={updateChannel}
                  errors={errors}
                  available={available}
                  generated={generated}
                  onGenerated={(id) => setGenerated(new Set(generated).add(id))}
                />
              )}
            </fieldset>
          </CompactFieldsContext.Provider>
        </section>
      </div>
      {failure && (
        <p role="alert" className="text-sm font-medium text-red-700">
          {failure.message}
        </p>
      )}
      <div className="sticky bottom-0 z-10 -mx-4 flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 bg-white px-4 py-3 shadow-[0_-4px_12px_rgb(0_0_0/0.03)]">
        <div>
          <p role="status" className="text-sm font-medium">
            {saving ? "Saving changes…" : dirty ? "Unsaved changes" : "All changes saved"}
          </p>
          <p className="text-xs text-slate-600">Changes apply to new conversations.</p>
        </div>
        <div className="flex gap-2">
          <Button
            type="button"
            variant="outline"
            disabled={saving || !dirty}
            onClick={() => {
              setForm(savedForm)
              setErrors({})
              setFailure(undefined)
              setGenerated(new Set())
            }}
          >
            Discard
          </Button>
          <Button type="submit" disabled={saving || !dirty}>
            {saving ? "Saving…" : "Save changes"}
          </Button>
        </div>
      </div>
    </form>
  )
}

interface SectionProps {
  form: HandoffForm
  update: (patch: Partial<HandoffForm>) => void
  errors: FieldErrors
}

function QuestionsSection({ form, update, errors }: SectionProps) {
  const { questions } = form
  const setQuestions = (next: HandoffForm["questions"]) => update({ questions: next })

  function move(index: number, by: -1 | 1) {
    const next = [...questions]
    const [question] = next.splice(index, 1)
    next.splice(index + by, 0, question)
    setQuestions(next)
    // Keep focus on the moved question's button, or on its other one once it reaches the end of the list
    const target = index + by
    const atEnd = by === -1 ? target === 0 : target === questions.length - 1
    const direction = (by === -1) !== atEnd ? "up" : "down"
    requestAnimationFrame(() => document.getElementById(`${fieldId(`qualificationQuestions.${target}`)}-${direction}`)?.focus())
  }

  return (
    <>
      <p className="text-sm text-slate-700">
        The assistant works these into the conversation naturally, in the visitor&apos;s language, before it suggests booking or sending an enquiry.
        The answers go with the enquiry, and visitors can edit them before sending. The enquiry form shows each question as written here. For example:
        What&apos;s your budget? When would you like to start?
      </p>
      <FieldError field="qualificationQuestions" errors={errors} />
      {questions.length === 0 && <p className="text-sm text-slate-600">No questions: the assistant just answers what visitors ask.</p>}
      <ol className="space-y-4">
        {questions.map((question, index) => {
          const field = `qualificationQuestions.${index}`
          return (
            <li key={question.id} className="flex items-end gap-2">
              <div className="min-w-0 flex-1">
                <TextField
                  field={field}
                  label={`Question ${index + 1}`}
                  value={question.text}
                  maxLength={MAX_QUESTION_LENGTH}
                  onChange={(text) => setQuestions(questions.map((current, at) => (at === index ? { ...current, text } : current)))}
                  errors={errors}
                />
              </div>
              <div className={`flex gap-1 ${errors[field] ? "mb-7" : ""}`}>
                <Button
                  id={`${fieldId(field)}-up`}
                  type="button"
                  variant="outline"
                  size="icon"
                  disabled={index === 0}
                  onClick={() => move(index, -1)}
                  aria-label={`Move question ${index + 1} up`}
                >
                  <ArrowUp aria-hidden />
                </Button>
                <Button
                  id={`${fieldId(field)}-down`}
                  type="button"
                  variant="outline"
                  size="icon"
                  disabled={index === questions.length - 1}
                  onClick={() => move(index, 1)}
                  aria-label={`Move question ${index + 1} down`}
                >
                  <ArrowDown aria-hidden />
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  onClick={() => {
                    setQuestions(questions.filter((_, at) => at !== index))
                    // To the question that took its place, or the add button after the last
                    requestAnimationFrame(() =>
                      (
                        document.getElementById(fieldId(`qualificationQuestions.${Math.min(index, questions.length - 2)}`)) ??
                        document.getElementById("handoff-add-question")
                      )?.focus()
                    )
                  }}
                  aria-label={`Remove question ${index + 1}`}
                >
                  <Trash2 aria-hidden />
                </Button>
              </div>
            </li>
          )
        })}
      </ol>
      <div className="space-y-2">
        <Button
          id="handoff-add-question"
          type="button"
          variant="outline"
          size="sm"
          disabled={questions.length >= MAX_QUALIFICATION_QUESTIONS}
          onClick={() => {
            setQuestions([...questions, newQuestion()])
            const added = questions.length
            requestAnimationFrame(() => document.getElementById(fieldId(`qualificationQuestions.${added}`))?.focus())
          }}
        >
          <Plus aria-hidden /> Add a question
        </Button>
        <p className="text-sm text-slate-600">
          Up to {MAX_QUALIFICATION_QUESTIONS} questions of {MAX_QUESTION_LENGTH} characters.
          {questions.length >= MAX_QUALIFICATION_QUESTIONS && " That's the most the assistant asks."}
        </p>
      </div>
    </>
  )
}

function BookingSection({ form, update, errors }: SectionProps) {
  return (
    <>
      <fieldset className="space-y-2" aria-describedby={errors.booking ? `${fieldId("booking")}-error` : undefined}>
        <legend className="mb-2 text-sm font-medium">How visitors book a meeting</legend>
        {BOOKING_OPTIONS.map((option) => (
          <label key={option.value} className="flex items-start gap-2 text-sm">
            <input
              type="radio"
              name="bookingType"
              value={option.value}
              checked={form.bookingType === option.value}
              onChange={() => update({ bookingType: option.value })}
              className="mt-0.5 size-4 accent-blue-700"
            />
            <span>
              <span className="font-medium">{option.label}</span>
              <span className="block text-slate-600">{option.description}</span>
            </span>
          </label>
        ))}
        <FieldError field="booking" errors={errors} />
      </fieldset>
      {form.bookingType === "link" && (
        <div className="space-y-5 border-t border-slate-200 pt-5">
          <TextField
            field="booking.url"
            label="Booking page"
            type="url"
            required
            placeholder="https://cal.example.com/your-team"
            hint="Opens in a new tab. The chat never marks the meeting as booked, since the booking is completed on that page."
            value={form.bookingUrl}
            onChange={(bookingUrl) => update({ bookingUrl })}
            errors={errors}
          />
          <TextField
            field="booking.label"
            label="Button text"
            hint="Leave empty for “Book a time” in the visitor's language."
            maxLength={40}
            value={form.bookingLabel}
            onChange={(bookingLabel) => update({ bookingLabel })}
            errors={errors}
          />
        </div>
      )}
      {form.bookingType === "calendar" && (
        <p className="rounded-md border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700">
          The calendars, meeting length and available hours are set in{" "}
          <Link href="/admin/appointments" className="font-medium text-blue-700 underline">
            Appointment settings
          </Link>
          . Your team is notified of each booking by an email to those calendars. Delivery channels are only for enquiries.
        </p>
      )}
    </>
  )
}

interface EnquirySectionProps extends SectionProps {
  updateChannel: (index: number, patch: Partial<ChannelForm>) => void
  available: string[]
  generated: Set<string>
  onGenerated: (id: string) => void
}

function EnquirySection(props: EnquirySectionProps) {
  const { form, update, errors } = props
  // Channels are checked even while enquiries are off, so once one has a problem while they're off its editors show until the
  // admin turns enquiries on or leaves the section, rather than hiding the fields to fix or vanishing mid-edit as it clears
  const channelErrors = Object.keys(errors).some((field) => field === "channels" || field.startsWith("channels."))
  const [revealed, setRevealed] = useState(false)
  if (!form.enquiryEnabled && channelErrors && !revealed) setRevealed(true)
  if (form.enquiryEnabled && revealed) setRevealed(false)
  const kept = form.channels.length
  const fixing = revealed && kept > 0

  return (
    <>
      <div className="flex items-start gap-3">
        <Switch
          id={fieldId("enquiryEnabled")}
          checked={form.enquiryEnabled}
          onCheckedChange={(enquiryEnabled) => update({ enquiryEnabled })}
          aria-describedby={`${fieldId("enquiryEnabled")}-hint`}
        />
        <div className="space-y-1">
          <Label htmlFor={fieldId("enquiryEnabled")}>Let visitors send an enquiry</Label>
          <p id={`${fieldId("enquiryEnabled")}-hint`} className="text-sm text-slate-600">
            Visitors review the details the assistant collected and send them to your team. They see exactly what will be sent.
          </p>
        </div>
      </div>
      <FieldError field="enquiryEnabled" errors={errors} />
      {form.enquiryEnabled ? (
        <>
          <fieldset className="space-y-4 border-t border-slate-200 pt-5">
            <legend className="text-sm font-medium">Contact details the form asks for</legend>
            <p className="text-sm text-slate-600">Off fields aren&apos;t collected. Require an email or a phone number so your team can reply.</p>
            <div className="grid gap-4 sm:grid-cols-2">
              {ENQUIRY_FIELDS.map((field) => (
                <SelectField
                  key={field}
                  field={`enquiryFields.${field}`}
                  label={ENQUIRY_FIELD_LABELS[field]}
                  value={form.fields[field]}
                  onChange={(mode) => update({ fields: { ...form.fields, [field]: mode as FieldMode } })}
                  options={MODE_OPTIONS}
                  errors={errors}
                />
              ))}
            </div>
            <p className="text-sm text-slate-600">
              The form also shows your qualification questions and what the visitor would like to discuss, prefilled from the conversation.
            </p>
          </fieldset>
          <ChannelsSection {...props} />
        </>
      ) : (
        <>
          <p className="text-sm text-slate-600">
            {fixing
              ? `Enquiries are off, but delivery channels are still checked when you save. ${
                  kept === 1 ? "Finish this channel or remove it if you don't need it." : "Finish these channels or remove the ones you don't need."
                }`
              : kept
                ? `Visitors can't send enquiries from the chat. ${
                    kept === 1 ? "Your delivery channel is kept" : `Your ${kept} delivery channels are kept`
                  } for when you turn enquiries back on.`
                : "Visitors can't send enquiries from the chat."}
          </p>
          {fixing && <ChannelsSection {...props} />}
        </>
      )}
    </>
  )
}

// Where enquiries are sent: while enquiries are on, or while they're off and a channel has a problem to fix, without adding
function ChannelsSection({ form, update, updateChannel, errors, available, generated, onGenerated }: EnquirySectionProps) {
  const full = form.channels.length >= MAX_DELIVERY_CHANNELS
  // "Add a delivery channel…", which the add buttons answer
  const missing = errors.channels ? `${fieldId("channels")}-error` : undefined

  function add(type: DeliveryChannelType) {
    update({ channels: [...form.channels, newChannel(type)] })
    const added = form.channels.length
    requestAnimationFrame(() => document.getElementById(fieldId(`channels.${added}.${type === "email" ? "recipients" : "url"}`))?.focus())
  }

  return (
    <section aria-labelledby="handoff-channels-heading" className="space-y-4 border-t border-slate-200 pt-5">
      <h3 id="handoff-channels-heading" className="text-sm font-semibold">
        Delivery channels
      </h3>
      <p className="text-sm text-slate-700">
        Where your team receives enquiries. Each enquiry goes to every channel. Visitors see it as sent once at least one channel accepts it.
        Deliveries that fail show in{" "}
        <Link href="/admin/conversations" className="font-medium text-blue-700 underline">
          Conversations
        </Link>
        , where you can retry them.
      </p>
      {form.channels.length === 0 && <p className="text-sm text-slate-600">No delivery channels yet.</p>}
      <ul className="space-y-4">
        {form.channels.map((channel, index) => (
          <li key={channel.id} className="space-y-4 rounded-md border border-slate-200 p-4">
            <div className="flex items-center justify-between gap-2">
              <h4 className="flex items-center gap-2 text-sm font-semibold">
                {channel.type === "email" ? <Mail size={16} aria-hidden /> : <Webhook size={16} aria-hidden />}
                {DELIVERY_CHANNEL_LABELS[channel.type]}
              </h4>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => {
                  update({ channels: form.channels.filter((_, at) => at !== index) })
                  // To an add button, or the switch while enquiries are off and there are none
                  requestAnimationFrame(() =>
                    (
                      document.querySelector<HTMLElement>("[data-add-channel]:not(:disabled)") ?? document.getElementById(fieldId("enquiryEnabled"))
                    )?.focus()
                  )
                }}
              >
                <Trash2 aria-hidden /> Remove
                <span className="sr-only"> {`${DELIVERY_CHANNEL_LABELS[channel.type].toLowerCase()} channel ${index + 1}`}</span>
              </Button>
            </div>
            <FieldError field={`channels.${index}.type`} errors={errors} />
            {!available.includes(channel.type) && (
              <p className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
                {CHANNEL_UNAVAILABLE[channel.type]} Until then, enquiries aren&apos;t delivered through this channel.
              </p>
            )}
            {channel.type === "email" ? (
              <TextAreaField
                field={`channels.${index}.recipients`}
                label="Recipients"
                required
                hint={`One email address per line, up to ${MAX_EMAIL_RECIPIENTS}. Each gets the enquiry with a link to the conversation.`}
                rows={3}
                value={channel.recipients}
                onChange={(recipients) => updateChannel(index, { recipients })}
                errors={errors}
              />
            ) : (
              <>
                <TextField
                  field={`channels.${index}.url`}
                  label="Endpoint URL"
                  type="url"
                  required
                  placeholder="https://hooks.example.com/lumi"
                  hint="Lumi POSTs each enquiry as JSON to this https:// address."
                  value={channel.url}
                  onChange={(url) => updateChannel(index, { url })}
                  errors={errors}
                />
                <SecretField
                  index={index}
                  channel={channel}
                  errors={errors}
                  generated={generated.has(channel.id)}
                  onChange={(secret) => updateChannel(index, { secret })}
                  onGenerate={() => {
                    updateChannel(index, { secret: generateSecret() })
                    onGenerated(channel.id)
                  }}
                />
              </>
            )}
          </li>
        ))}
      </ul>
      <FieldError field="channels" errors={errors} />
      {form.enquiryEnabled && (
        <div className="space-y-2">
          <div className="flex flex-wrap gap-2">
            <Button
              id="handoff-add-email"
              data-add-channel
              type="button"
              variant="outline"
              size="sm"
              disabled={full || !available.includes("email")}
              aria-describedby={missing}
              onClick={() => add("email")}
            >
              <Plus aria-hidden /> Add email channel
            </Button>
            <Button
              data-add-channel
              type="button"
              variant="outline"
              size="sm"
              disabled={full || !available.includes("webhook")}
              aria-describedby={missing}
              onClick={() => add("webhook")}
            >
              <Plus aria-hidden /> Add webhook
            </Button>
          </div>
          {(["email", "webhook"] as const)
            .filter((type) => !available.includes(type))
            .map((type) => (
              <p key={type} className="text-sm text-slate-600">
                {CHANNEL_UNAVAILABLE[type]}
              </p>
            ))}
          {full && <p className="text-sm text-slate-600">That&apos;s the most channels Lumi sends to ({MAX_DELIVERY_CHANNELS}).</p>}
        </div>
      )}
    </section>
  )
}

interface SecretFieldProps {
  index: number
  channel: ChannelForm
  errors: FieldErrors
  generated: boolean
  onChange: (secret: string) => void
  onGenerate: () => void
}

// Write-only: a saved secret is never shown, and an empty field keeps it
function SecretField({ index, channel, errors, generated, onChange, onGenerate }: SecretFieldProps) {
  const field = `channels.${index}.secret`
  const hint = generated
    ? "Copy this secret into your endpoint's settings now: it isn't shown again after saving."
    : channel.hasSecret
      ? "A secret is saved. Leave this empty to keep it, or enter a new one to replace it."
      : `Lumi signs each request with it (X-Lumi-Signature), so your endpoint can check it came from Lumi. ${MIN_WEBHOOK_SECRET_LENGTH} to 200 characters.`

  return (
    <div className="space-y-2">
      <FieldLabel field={field} label="Signing secret" required={!channel.hasSecret} />
      <FieldHint field={field}>{hint}</FieldHint>
      <div className="flex max-w-xl gap-2">
        <Input
          id={fieldId(field)}
          value={channel.secret}
          onChange={(event) => onChange(event.target.value)}
          placeholder={channel.hasSecret ? "Secret saved" : undefined}
          autoComplete="off"
          spellCheck={false}
          maxLength={200}
          aria-required={!channel.hasSecret || undefined}
          aria-invalid={errors[field] ? true : undefined}
          aria-describedby={describedBy(field, errors, hint)}
          className="font-mono"
        />
        <Button type="button" variant="outline" onClick={onGenerate}>
          <KeyRound aria-hidden /> Generate
        </Button>
      </div>
      <FieldError field={field} errors={errors} />
    </div>
  )
}
