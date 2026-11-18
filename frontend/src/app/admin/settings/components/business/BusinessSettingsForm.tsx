"use client"

import { useEffect, useRef, useState } from "react"
import type { BusinessSettingsInput } from "@lumi/shared-contracts/business"
import { Compass, Contact, MessagesSquare, Palette } from "lucide-react"

import { Button } from "@/components/ui/button"
import { useToast } from "@/components/ui/use-toast"
import AppearancePreview from "@/components/BusinessSettings/AppearancePreview"
import { CompactFieldsContext } from "@/components/BusinessSettings/fields"
import {
  errorsFromProblems,
  fieldId,
  formFromSettings,
  settingsFromForm,
  validateForm,
  type BusinessForm,
  type FieldErrors,
} from "@/components/BusinessSettings/form"
import {
  AgentStepFields,
  AssistantStepFields,
  BrandingStepFields,
  BusinessStepFields,
  ContactStepFields,
  DefaultLanguageField,
  GreetingFields,
  StartersStepFields,
} from "@/components/BusinessSettings/steps"

import { updateBusiness } from "../../actions"
import { useLeaveWarning } from "../useLeaveWarning"
import BusinessLogoField from "./BusinessLogoField"

interface IProps {
  // The stored settings, as entered
  settings: BusinessSettingsInput
}

const SECTIONS = [
  {
    id: "business",
    icon: Contact,
    title: "Business & contact",
    description: "Your business details and public contact links.",
    fields: ["businessName", "websiteUrl", "careersUrl", "contactUrl", "contactEmail", "contactPhone"],
  },
  {
    id: "appearance",
    icon: Palette,
    title: "Appearance",
    description: "The name, picture and branding visitors see.",
    fields: ["assistantName", "avatarUrl", "logoUrl", "primaryColor"],
  },
  {
    id: "conversation",
    icon: MessagesSquare,
    title: "Conversation",
    description: "The language, greeting and suggestions visitors start with.",
    fields: ["defaultLanguage", "greeting", "starters"],
  },
  {
    id: "guidance",
    icon: Compass,
    title: "Assistant guidance",
    description: "Help the assistant represent your business.",
    fields: ["agentDescription", "agentGuidance"],
  },
] as const

// Why the last save failed: the installation isn't set up yet (NOT_SET_UP), or a message to show
type Failure = { kind: "notSetUp" } | { kind: "error"; message: string }

export default function BusinessSettingsForm({ settings }: IProps) {
  const { toast } = useToast()
  const [form, setForm] = useState<BusinessForm>(() => formFromSettings(settings))
  const [savedForm, setSavedForm] = useState(() => formFromSettings(settings))
  const [active, setActive] = useState<string>("business")
  const headingRef = useRef<HTMLHeadingElement>(null)
  const [errors, setErrors] = useState<FieldErrors>({})
  const [saving, setSaving] = useState(false)
  const [uploading, setUploading] = useState(false)
  // Counts saves and discards, which settle what the logo field announced about an upload or a removal
  const [logoResets, setLogoResets] = useState(0)
  const [failure, setFailure] = useState<Failure>()

  const dirty = JSON.stringify(form) !== JSON.stringify(savedForm)
  const busy = saving || uploading
  const section = SECTIONS.find(({ id }) => id === active) ?? SECTIONS[0]

  useLeaveWarning(dirty, "Leave without saving your business settings? Your changes will be lost.")

  // The form as last changed, so a logo upload that finishes after the admin edited other fields keeps their edits
  const latestForm = useRef(form)
  useEffect(() => {
    latestForm.current = form
  }, [form])

  function update(patch: Partial<BusinessForm>) {
    const next = { ...latestForm.current, ...patch }
    latestForm.current = next
    setForm(next)
    // Problems already shown clear as they're fixed
    setErrors((shown) =>
      Object.keys(shown).length ? Object.fromEntries(Object.entries(validateForm(next)).filter(([field]) => field in shown)) : shown
    )
  }

  // Shows the problems and moves focus to the first
  function showProblems(problems: FieldErrors) {
    setErrors(problems)
    const [first] = Object.keys(problems)
    const owner = SECTIONS.find(({ fields }) => fields.some((field) => first === field || first?.startsWith(`${field}.`)))
    if (owner) setActive(owner.id)
    // After rendering, so the field's error is there to be read with it
    requestAnimationFrame(() =>
      (document.getElementById(fieldId(first)) ?? document.querySelector<HTMLInputElement>('input[name="startersMode"]'))?.focus()
    )
  }

  async function save() {
    if (busy || !dirty) return
    setFailure(undefined)
    const problems = validateForm(form)
    if (Object.keys(problems).length) return showProblems(problems)

    setSaving(true)
    try {
      const result = await updateBusiness(settingsFromForm(form))
      if (result.ok) {
        setErrors({})
        setSavedForm(form)
        setLogoResets((count) => count + 1)
        toast({ title: "Business settings saved", description: "The chat shows them from its next visit." })
      } else if ("problems" in result) {
        showProblems(errorsFromProblems(result.problems))
      } else if ("code" in result) {
        setFailure({ kind: "notSetUp" })
      } else {
        setFailure({ kind: "error", message: result.error })
      }
    } catch (error) {
      console.error("Saving the business settings failed", error)
      setFailure({ kind: "error", message: "The settings couldn't be saved. Try again in a moment." })
    } finally {
      setSaving(false)
    }
  }

  const problemCount = Object.keys(errors).length

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
      <div className="flex flex-col gap-5 xl:flex-row xl:gap-8">
        <nav aria-label="Business settings sections" className="flex gap-1 overflow-x-auto pb-1 xl:w-48 xl:shrink-0 xl:flex-col">
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
        <section aria-labelledby="business-section-heading" className="min-w-0 flex-1">
          <div className="mb-6">
            <h2 ref={headingRef} tabIndex={-1} id="business-section-heading" className="flex items-center gap-2 text-lg font-semibold outline-none">
              <span className="rounded-md bg-blue-50 p-1.5 text-blue-700">
                <section.icon size={18} aria-hidden />
              </span>
              {section.title}
            </h2>
            <p className="text-sm text-slate-600">{section.description}</p>
            <p className="mt-2 text-xs text-slate-500">All fields are optional unless marked required.</p>
          </div>
          <CompactFieldsContext.Provider value={true}>
            <fieldset disabled={saving} className="min-w-0 space-y-6">
              {active === "business" && (
                <>
                  <div className="grid gap-5 lg:grid-cols-2">
                    <BusinessStepFields form={form} update={update} errors={errors} admin />
                  </div>
                  <div className="space-y-5 border-t border-slate-200 pt-5">
                    <ContactStepFields form={form} update={update} errors={errors} admin />
                    {/* Not a live region: it follows the fields above as they're typed */}
                    <p className="rounded-md bg-slate-50 p-3 text-sm break-words text-slate-700">
                      {form.contactUrl.trim()
                        ? `Visitors will open your contact page: ${form.contactUrl.trim()}`
                        : form.contactEmail.trim()
                          ? `Visitors will email: ${form.contactEmail.trim()}`
                          : "No contact link will be shown. Add a contact page or email to provide one."}
                    </p>
                  </div>
                </>
              )}
              {active === "appearance" && (
                <div className="grid items-start gap-6 lg:grid-cols-2">
                  <div className="space-y-5">
                    <AssistantStepFields form={form} update={update} errors={errors} admin />
                    <BrandingStepFields
                      form={form}
                      update={update}
                      errors={errors}
                      admin
                      logoField={
                        <BusinessLogoField
                          resetKey={logoResets}
                          value={form.logoUrl}
                          onChange={(logoUrl) => update({ logoUrl })}
                          onUploadingChange={setUploading}
                          errors={errors}
                        />
                      }
                    />
                  </div>
                  <AppearancePreview form={form} />
                </div>
              )}
              {active === "conversation" && (
                <>
                  <DefaultLanguageField form={form} update={update} errors={errors} />
                  <div className="border-t border-slate-200 pt-5">
                    <GreetingFields form={form} update={update} errors={errors} admin />
                  </div>
                  <div className="border-t border-slate-200 pt-5">
                    <StartersStepFields form={form} update={update} errors={errors} admin />
                  </div>
                </>
              )}
              {active === "guidance" && <AgentStepFields form={form} update={update} errors={errors} admin />}
            </fieldset>
          </CompactFieldsContext.Provider>
        </section>
      </div>
      {failure && (
        <p role="alert" className="text-sm font-medium text-red-700">
          {failure.kind === "notSetUp" ? (
            <>
              Lumi isn&apos;t set up yet:{" "}
              <a href="/setup" className="underline">
                finish the onboarding wizard
              </a>{" "}
              first.
            </>
          ) : (
            failure.message
          )}
        </p>
      )}
      <div className="sticky bottom-0 z-10 -mx-4 flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 bg-white px-4 py-3 shadow-[0_-4px_12px_rgb(0_0_0/0.03)]">
        <div>
          <p role="status" className="text-sm font-medium">
            {saving ? "Saving changes…" : uploading ? "Uploading the logo…" : dirty ? "Unsaved changes" : "All changes saved"}
          </p>
          <p className="text-xs text-slate-600">Changes apply to new chat visits.</p>
        </div>
        <div className="flex gap-2">
          <Button
            type="button"
            variant="outline"
            disabled={busy || !dirty}
            onClick={() => {
              setForm(savedForm)
              setErrors({})
              setFailure(undefined)
              setLogoResets((count) => count + 1)
            }}
          >
            Discard
          </Button>
          <Button type="submit" disabled={busy || !dirty}>
            {saving ? "Saving…" : "Save changes"}
          </Button>
        </div>
      </div>
    </form>
  )
}
