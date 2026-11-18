"use client"

import { useEffect, useRef, useState } from "react"
import Link from "next/link"
import { unstable_rethrow } from "next/navigation"
import { ArrowLeft, ArrowRight, Check } from "lucide-react"

import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import {
  errorsFor,
  errorsFromProblems,
  fieldId,
  formFromSettings,
  settingsFromForm,
  validateForm,
  type BusinessForm,
  type FieldErrors,
} from "@/components/BusinessSettings/form"
import { BUSINESS_STEPS, stepOfField } from "@/components/BusinessSettings/steps"

import { setupBusiness } from "./actions"
import { ADMIN_STEP, AdminStepFields, adminSummary, emptyAdmin, validateAdmin, type AdminForm } from "./AdminStep"

type Notice = { kind: "alreadySetUp" } | { kind: "adminExists" } | { kind: "error"; message: string }

// The admin step, when there's one, comes after the business steps
const ADMIN_INDEX = BUSINESS_STEPS.length
const isAdminField = (field: string | undefined) => Boolean(field?.startsWith(`${ADMIN_STEP.fields[0]}.`))
const stepOf = (field: string) => (isAdminField(field) ? ADMIN_INDEX : stepOfField(field))

// Moves focus to a field with a problem
function focusField(field: string | undefined) {
  const element = field && document.getElementById(fieldId(field))
  if (element) element.focus()
}

// Once its error has rendered, so the field is read with it
const focusFieldAfterRender = (field: string) => requestAnimationFrame(() => focusField(field))

interface BusinessWizardProps {
  // Local sign-in mode without an admin yet: a step for the first admin, created with the settings
  askAdmin: boolean
  // Local sign-in mode: finishing leads to the admin's sign-in rather than the chat
  local: boolean
  // The visitor's access to the setup expired, so the setup token has to be entered again
  onLocked: () => void
}

// The onboarding wizard: one step per group of settings, and the first admin in local sign-in mode, then a review that sets
// the business up
export default function BusinessWizard({ askAdmin: initialAskAdmin, local, onLocked }: BusinessWizardProps) {
  const [form, setForm] = useState<BusinessForm>(() => formFromSettings())
  const [admin, setAdmin] = useState<AdminForm>(emptyAdmin)
  // Dropped when the API says an admin already exists, added when it says one is needed
  const [askAdmin, setAskAdmin] = useState(initialAskAdmin)
  const [step, setStep] = useState(0)
  // Counts every move to a step, so a move that keeps the index announces itself too, e.g. when the Administrator step is
  // added where the review was
  const [visit, setVisit] = useState(0)
  // The furthest step reached: every step up to it can be opened from the step list
  const [furthest, setFurthest] = useState(0)
  // The problems shown, once the visitor tried to go on from a step or finish
  const [errors, setErrors] = useState<FieldErrors>({})
  const [saving, setSaving] = useState(false)
  const [notice, setNotice] = useState<Notice>()
  const headingRef = useRef<HTMLHeadingElement>(null)
  // A field to focus once its step shows, e.g. the first the server found a problem with
  const pendingFocus = useRef<string | undefined>(undefined)
  const firstRender = useRef(true)

  // Each step announces itself by its heading, or its first problem when there's one to fix
  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false
      return
    }
    if (pendingFocus.current) {
      focusField(pendingFocus.current)
      pendingFocus.current = undefined
    } else {
      headingRef.current?.focus()
    }
  }, [step, visit])

  const steps = askAdmin ? [...BUSINESS_STEPS, ADMIN_STEP] : BUSINESS_STEPS
  const REVIEW = steps.length
  const STEP_TITLES = [...steps.map((step) => step.title), "Review"]
  const current = steps[step]
  const stepErrors = current ? errorsFor(errors, current.fields) : {}

  // Every problem, the admin's included when there's an admin step
  const validate = (nextForm = form, nextAdmin = admin) => ({ ...validateForm(nextForm), ...(askAdmin ? validateAdmin(nextAdmin) : {}) })

  // Problems already shown clear as they're fixed
  const revalidate = (nextForm: BusinessForm, nextAdmin: AdminForm) => {
    if (Object.keys(errors).length) setErrors(errorsFor(validate(nextForm, nextAdmin), Object.keys(errors)))
  }

  function update(patch: Partial<BusinessForm>) {
    const next = { ...form, ...patch }
    setForm(next)
    revalidate(next, admin)
  }

  function updateAdmin(patch: Partial<AdminForm>) {
    const next = { ...admin, ...patch }
    setAdmin(next)
    revalidate(form, next)
  }

  function goTo(index: number, focus?: string) {
    pendingFocus.current = focus
    setNotice(undefined)
    setStep(index)
    setVisit((count) => count + 1)
    setFurthest((furthest) => Math.max(furthest, index))
  }

  // Going on checks the step first and stays on it to show its problems. Going back keeps what's entered as it is: the
  // review checks everything before finishing
  function leaveTo(index: number) {
    if (index > step && current) {
      const problems = errorsFor(validate(), current.fields)
      setErrors(problems)
      const [first] = Object.keys(problems)
      if (first) return focusFieldAfterRender(first)
    }
    goTo(index)
  }

  const next = () => leaveTo(step + 1)

  async function finish() {
    const problems = validate()
    if (Object.keys(problems).length) {
      setErrors(problems)
      const [first] = Object.keys(problems)
      goTo(Math.max(stepOf(first), 0), first)
      return
    }

    setSaving(true)
    setNotice(undefined)
    try {
      // Sets the business up and opens the chat, or the admin's sign-in; only a failure comes back
      const firstAdmin = askAdmin ? { email: admin.email, name: admin.name, password: admin.password } : undefined
      const result = await setupBusiness(settingsFromForm(form), firstAdmin)
      if ("locked" in result) {
        onLocked()
      } else if ("problems" in result) {
        const serverErrors = errorsFromProblems(result.problems)
        setErrors(serverErrors)
        const [first] = Object.keys(serverErrors)
        // The API needs a first admin the wizard didn't ask for
        if (isAdminField(first)) setAskAdmin(true)
        const index = stepOf(first)
        if (index >= 0) goTo(index, first)
        else setNotice({ kind: "error", message: result.problems.map((problem) => problem.message).join(" ") })
      } else if ("code" in result && result.code === "ADMIN_EXISTS") {
        // Created meanwhile, e.g. with the backend's admin:reset script: setup goes on without the step
        setAskAdmin(false)
        setAdmin(emptyAdmin())
        setErrors({})
        setStep(BUSINESS_STEPS.length)
        setFurthest(BUSINESS_STEPS.length)
        setNotice({ kind: "adminExists" })
      } else if ("code" in result) {
        setNotice({ kind: "alreadySetUp" })
      } else if ("error" in result) {
        setNotice({ kind: "error", message: result.error })
      }
    } catch (error) {
      // A successful setup redirects to the chat or the sign-in, which rejects the action's promise with Next.js's redirect error
      unstable_rethrow(error)
      console.error("Setting the business up failed", error)
      setNotice({ kind: "error", message: "The settings couldn't be saved: the server didn't answer. Try again in a moment." })
    } finally {
      setSaving(false)
    }
  }

  const allErrors = step === REVIEW ? validate() : {}

  return (
    <div className="mx-auto max-w-3xl">
      <nav aria-label="Setup steps" className="mb-6">
        <ol className="flex flex-wrap gap-x-4 gap-y-2 text-sm">
          {STEP_TITLES.map((title, index) => {
            const label = (
              <>
                <span
                  className={cn(
                    "mr-1.5 inline-flex size-6 items-center justify-center rounded-full border text-xs",
                    index === step
                      ? "border-blue-700 bg-blue-700 text-white"
                      : index < furthest
                        ? "border-slate-500 text-slate-700"
                        : "border-slate-300 text-slate-600"
                  )}
                  aria-hidden
                >
                  {index !== step && index < furthest ? <Check size={14} /> : index + 1}
                </span>
                <span className="sr-only">Step {index + 1}: </span>
                {title}
                {index !== step && index < furthest && <span className="sr-only"> (done)</span>}
              </>
            )
            return (
              <li key={title} aria-current={index === step ? "step" : undefined} className={index === step ? "font-semibold" : "text-slate-600"}>
                {index !== step && index <= furthest ? (
                  // Steps reached before can be reopened; later ones open in order, each checked before the next
                  <button
                    type="button"
                    className="rounded-sm underline-offset-4 hover:underline focus-visible:ring-2 focus-visible:ring-blue-700 focus-visible:outline-none"
                    onClick={() => leaveTo(index)}
                  >
                    {label}
                  </button>
                ) : (
                  <span>{label}</span>
                )}
              </li>
            )
          })}
        </ol>
      </nav>

      <form
        noValidate
        className="space-y-6 rounded-md border border-slate-200 bg-white p-6 shadow-sm"
        onSubmit={(event) => {
          event.preventDefault()
          if (step === REVIEW) finish()
          else next()
        }}
      >
        <div>
          <h2 ref={headingRef} tabIndex={-1} className="text-xl font-semibold outline-none">
            {STEP_TITLES[step]}
          </h2>
          <p className="text-sm text-slate-600">
            Step {step + 1} of {STEP_TITLES.length}.{" "}
            {current
              ? current.description
              : local
                ? "Check your settings, then finish and sign in to the admin to add your business knowledge and embed the widget."
                : "Check your settings, then finish to open the chat. Afterwards, sign in to the admin to add your business knowledge and embed the widget."}
          </p>
        </div>

        {current ? (
          <div className="space-y-5">
            {Object.keys(stepErrors).length > 0 && (
              <p role="alert" className="text-sm font-medium text-red-700">
                {Object.keys(stepErrors).length === 1 ? "One setting needs fixing." : `${Object.keys(stepErrors).length} settings need fixing.`}
              </p>
            )}
            {current.id === ADMIN_STEP.id ? (
              <AdminStepFields admin={admin} update={updateAdmin} errors={stepErrors} />
            ) : (
              "Component" in current && <current.Component form={form} update={update} errors={stepErrors} />
            )}
          </div>
        ) : (
          <div className="space-y-5">
            {steps.map((reviewed, index) => {
              const problems = Object.keys(errorsFor(allErrors, reviewed.fields)).length
              const summary = "summary" in reviewed ? reviewed.summary(form) : adminSummary(admin)
              return (
                <section key={reviewed.id} aria-labelledby={`review-${reviewed.id}`} className="border-b border-slate-200 pb-4 last:border-0">
                  <div className="mb-2 flex items-center justify-between gap-4">
                    <h3 id={`review-${reviewed.id}`} className="font-semibold">
                      {reviewed.title}
                    </h3>
                    <Button type="button" variant="outline" size="sm" onClick={() => goTo(index)}>
                      Edit<span className="sr-only"> {reviewed.title}</span>
                    </Button>
                  </div>
                  {problems > 0 && <p className="mb-2 text-sm font-medium text-red-700">Needs fixing before you finish.</p>}
                  <dl className="grid gap-x-4 gap-y-1 text-sm sm:grid-cols-[12rem_1fr]">
                    {summary.map(({ label, value }) => (
                      <div key={label} className="contents">
                        <dt className="text-slate-600">{label}</dt>
                        <dd className="break-words whitespace-pre-wrap">{value}</dd>
                      </div>
                    ))}
                  </dl>
                </section>
              )
            })}
          </div>
        )}

        <p role="status" className="sr-only">
          {saving ? "Setting up…" : ""}
        </p>
        {notice && (
          <div
            role="alert"
            className={cn(
              "rounded-md border p-3 text-sm",
              notice.kind === "adminExists" ? "border-amber-300 bg-amber-50 text-amber-900" : "border-red-200 bg-red-50 text-red-800"
            )}
          >
            {notice.kind === "adminExists" ? (
              "An admin account already exists, so setup won't create another. Finish setup, then sign in with that account. If nobody knows its password, reset it with the backend's admin:reset script."
            ) : notice.kind === "alreadySetUp" ? (
              <>
                This installation has already been set up, so these settings weren&apos;t saved. Admins change them in the admin&apos;s Settings.{" "}
                <Link href="/" className="font-medium underline">
                  Open the chat
                </Link>
              </>
            ) : (
              notice.message
            )}
          </div>
        )}

        <div className="flex flex-wrap justify-between gap-2 border-t border-slate-200 pt-4">
          {step > 0 ? (
            <Button type="button" variant="outline" onClick={() => goTo(step - 1)}>
              <ArrowLeft aria-hidden /> Back
            </Button>
          ) : (
            <span />
          )}
          {step === REVIEW ? (
            <Button type="submit" disabled={saving}>
              {saving ? "Finishing…" : "Finish setup"}
            </Button>
          ) : (
            <div className="flex flex-wrap gap-2">
              {/* Once the review was reached, e.g. to change one setting from it */}
              {furthest === REVIEW && step + 1 < REVIEW && (
                <Button type="button" variant="outline" onClick={() => leaveTo(REVIEW)}>
                  Back to review
                </Button>
              )}
              <Button type="submit">
                Next: {STEP_TITLES[step + 1]} <ArrowRight aria-hidden />
              </Button>
            </div>
          )}
        </div>
      </form>
    </div>
  )
}
