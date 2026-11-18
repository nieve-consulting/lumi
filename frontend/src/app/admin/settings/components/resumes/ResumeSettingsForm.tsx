"use client"

import { useState } from "react"
import Link from "next/link"
import type { ResumeSettings } from "@/generated/graphql"
import { contrastRatio, parseHexColor } from "@lumi/shared-contracts/business"
import {
  DEFAULT_RESUME_COLORS,
  fadeAdvice,
  fadeContrast,
  FOOTER_TEXT_MAX_LENGTH,
  footerShowsGradient,
  MIN_FOOTER_CONTRAST,
  MIN_RESUME_CONTRAST,
  readableTextColor,
} from "@lumi/shared-contracts/resume"
import { FileText, Palette } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { useToast } from "@/components/ui/use-toast"
import { CompactFieldsContext, describedBy, FieldError, FieldHint, FieldLabel, TextField } from "@/components/BusinessSettings/fields"
import { fieldId, type FieldErrors } from "@/components/BusinessSettings/form"

import LogoUploadField, { useLogoUpload } from "../LogoUploadField"
import { useFormDraft } from "../useFormDraft"
import { useLeaveWarning } from "../useLeaveWarning"
import { updateResumes } from "./actions"
import { displayUrl, errorsByField, formFromSettings, settingsFromForm, STYLE_FIELDS, validateForm, type ResumeForm } from "./form"
import ResumePreview from "./ResumePreview"

// Rounded down, so a contrast just under a minimum never reads as meeting it, e.g. 4.48 as 4.4:1 rather than 4.5:1
const ratio = (value: number) => `${(Math.floor(value * 10) / 10).toFixed(1)}:1`

// The header band is 65 pixels tall in a third of the page's width
const LOGO_TIPS =
  "Shown at full height in the header band, in a space about four times as wide as it is tall: include any margin you want in the image. Use a logo that reads on the band colour, e.g. a white logo on a dark band. Without one, the header shows your business name."

const LOGO_HINT = `${LOGO_TIPS} Upload a JPEG, PNG, WebP, GIF or AVIF image, or enter its https address.`

const UPLOADED_LOGO_HINT = `${LOGO_TIPS} To use an image address instead, remove this logo.`

// A colour box's colour: its own, the default while empty, or "invalid" while it holds something that isn't a colour
const colorOf = (value: string, fallback?: string) => (value.trim() ? (parseHexColor(value) ?? "invalid") : fallback)

// A background a colour is shown on, with the contrast its text there needs: 3:1 for headings on the page, 4.5:1 for the
// footer text, which long text sets smaller
type Background = { name: string; color: string; minimum: number }

// How a colour reads against the backgrounds it's shown on, e.g. "Readable: 10.4:1 on the page (needs 3:1), 9.1:1 on the
// footer (needs 4.5:1)."
function contrastStatus(color: string, backgrounds: Background[]) {
  const ratios = backgrounds.map(({ name, color: background, minimum }) => ({ name, minimum, value: contrastRatio(color, background) }))
  const readable = ratios.every(({ value, minimum }) => value >= minimum)
  const list = ratios.map(({ name, value, minimum }) => `${ratio(value)} on ${name} (needs ${minimum}:1)`).join(", ")
  return {
    text: readable ? `Readable: ${list}.` : `Too low: ${list}. Pick a darker or lighter colour.`,
    readable,
  }
}

interface ColorFieldProps {
  field: "headerColor" | "accentColor" | "gradientColor"
  label: string
  hint: string
  // The colour the field stands for while empty, or undefined when empty means none
  fallback?: string
  value: string
  onChange: (value: string) => void
  errors: FieldErrors
  // How the colour reads where the resume shows it, announced as it changes; undefined while there's nothing to say
  status?: { text: string; readable: boolean }
}

// A hex colour box with a colour picker beside it, like the business settings' primary colour
function ColorField({ field, label, hint, fallback, value, onChange, errors, status }: ColorFieldProps) {
  const hex = parseHexColor(value)
  const id = fieldId(field)
  // Only the field being edited announces its status: a band colour change also changes the others' contrast
  const [focused, setFocused] = useState(false)
  return (
    <div
      className="space-y-2"
      onFocus={() => setFocused(true)}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) setFocused(false)
      }}
    >
      <FieldLabel field={field} label={label} />
      <FieldHint field={field}>{hint}</FieldHint>
      <div className="flex items-center gap-3">
        <Input
          id={id}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder={fallback ?? "#rrggbb"}
          autoComplete="off"
          spellCheck={false}
          maxLength={7}
          aria-invalid={errors[field] ? true : undefined}
          aria-describedby={[describedBy(field, errors, hint), `${id}-contrast`].filter(Boolean).join(" ")}
          className="w-32 font-mono"
        />
        <input
          type="color"
          aria-label={`Pick the ${label.toLowerCase()}`}
          value={hex ?? fallback ?? "#000000"}
          onChange={(event) => onChange(event.target.value)}
          className="h-10 w-14 cursor-pointer rounded-md border border-slate-300 bg-white p-1"
        />
        {value.trim() && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            aria-label={fallback ? `Use the default ${label.toLowerCase()}` : `Clear the ${label.toLowerCase()}`}
            onClick={() => onChange("")}
          >
            {fallback ? "Use default" : "Clear"}
          </Button>
        )}
      </div>
      {/* Announced as the colour changes while the field has focus; the field's error says it once the admin tries to save */}
      <p
        id={`${id}-contrast`}
        role={focused ? "status" : undefined}
        className={!status || status.readable ? "text-sm text-slate-600" : "text-sm font-medium text-red-700"}
      >
        {!errors[field] && status?.text}
      </p>
      <FieldError field={field} errors={errors} />
    </div>
  )
}

// A titled group of settings for one part of the resume
function SettingsGroup({ id, title, description, children }: { id: string; title: string; description: string; children: React.ReactNode }) {
  return (
    <section aria-labelledby={`${id}-heading`} className="space-y-4 border-t border-slate-200 pt-4 first:border-t-0 first:pt-0">
      <div>
        <h3 id={`${id}-heading`} className="font-semibold">
          {title}
        </h3>
        <p className="text-sm text-slate-600">{description}</p>
      </div>
      {children}
    </section>
  )
}

interface IProps {
  // The stored settings, as entered, or their defaults until first saved
  settings: ResumeSettings
  // The business settings' name and website, which the resume's header and footer show
  businessName: string
  websiteUrl?: string
}

export default function ResumeSettingsForm({ settings, businessName, websiteUrl }: IProps) {
  const { toast } = useToast()
  const { form, setForm, update, errors, setErrors } = useFormDraft<ResumeForm>(() => formFromSettings(settings), validateForm)
  const [savedForm, setSavedForm] = useState(() => formFromSettings(settings))
  const [saved, setSaved] = useState(Boolean(settings.updatedAt))
  const [saving, setSaving] = useState(false)
  const [failure, setFailure] = useState<string>()
  const logo = useLogoUpload({
    what: "resume logo",
    uploadedMessage: "Logo uploaded. Save to use it on resumes.",
    onUploaded: (logoUrl) => update({ logoUrl }),
  })

  const dirty = JSON.stringify(form) !== JSON.stringify(savedForm)
  const busy = saving || logo.uploading
  // Problems with the styling show even while resumes are off, as they're checked then too
  const showStyle = form.enabled || STYLE_FIELDS.some((field) => errors[field])

  // A logo still uploading would be lost too
  useLeaveWarning(dirty || logo.uploading, "Leave without saving your resume settings? Your changes will be lost.")

  // Shows the problems and moves focus to the first
  function showProblems(problems: FieldErrors) {
    setErrors(problems)
    const [first] = Object.keys(problems)
    // After rendering, so the field's error is there to be read with it
    if (first) requestAnimationFrame(() => document.getElementById(fieldId(first))?.focus())
  }

  async function save() {
    if (busy || !dirty) return
    setFailure(undefined)
    const problems = validateForm(form)
    if (Object.keys(problems).length) return showProblems(problems)

    setSaving(true)
    try {
      const result = await updateResumes(settingsFromForm(form))
      if (result.ok) {
        const next = formFromSettings(result.settings)
        setForm(next)
        setSavedForm(next)
        setSaved(true)
        setErrors({})
        logo.saved()
        toast({
          title: "Resume settings saved",
          description: next.enabled ? "New resumes use them right away." : "Lumi no longer offers resumes.",
        })
      } else if ("problems" in result) {
        showProblems(errorsByField(result.problems))
      } else {
        setFailure(result.error)
      }
    } catch (error) {
      console.error("Saving the resume settings failed", error)
      setFailure("The resume settings couldn't be saved. Try again in a moment.")
    } finally {
      setSaving(false)
    }
  }

  const logoUrl = form.logoUrl.trim()
  // How each colour reads where the resume shows it: the default's while a box is empty, and nothing to say while a box holds
  // something that isn't a colour yet, like the business settings' primary colour
  const headerColor = colorOf(form.headerColor, DEFAULT_RESUME_COLORS.header)!
  const accentColor = colorOf(form.accentColor, DEFAULT_RESUME_COLORS.accent)!
  const gradientColor = colorOf(form.gradientColor)
  // The accent and gradient colours only show on the header colour in the footer text
  const footerText = form.footerText.trim()
  const page = { name: "the page", color: "#ffffff", minimum: MIN_RESUME_CONTRAST }
  const bands = headerColor === "invalid" || !footerText ? [] : [{ name: "the footer", color: headerColor, minimum: MIN_FOOTER_CONTRAST }]
  const nameColor = headerColor !== "invalid" && (readableTextColor(headerColor) === "#ffffff" ? "white" : "black")
  const headerStatus = nameColor
    ? { text: `${logoUrl ? "If the logo can't be loaded" : "Without a logo"}, your business name shows in ${nameColor}.`, readable: true }
    : undefined
  const accentStatus = accentColor === "invalid" ? undefined : contrastStatus(accentColor, [page, ...bands])
  const gradientStatus = (() => {
    if (gradientColor === undefined || gradientColor === "invalid") return undefined
    if (!bands.length) return { text: "Enter a valid band colour to check this colour's contrast.", readable: true }
    // The resume draws a single character in the accent colour alone
    if (!footerShowsGradient(footerText)) return { text: "With one character, the footer text shows in the accent colour alone.", readable: true }
    const ends = contrastStatus(gradientColor, bands)
    if (!ends.readable || accentColor === "invalid" || contrastRatio(accentColor, headerColor) < MIN_FOOTER_CONTRAST) return ends
    // Both ends read on the band, but the colours the characters between them are drawn in may pass through it
    const faded = fadeContrast(footerText, gradientColor, accentColor, headerColor)
    return faded < MIN_FOOTER_CONTRAST
      ? {
          text: `Too low in the middle: the footer text fades through ${ratio(faded)} on the footer (needs ${MIN_FOOTER_CONTRAST}:1). To fix it, ${fadeAdvice(accentColor, headerColor)}.`,
          readable: false,
        }
      : ends
  })()

  // Only the footer text uses the gradient, so it's asked for once there is some; a problem with it still shows
  const showGradient = Boolean(footerText) || Boolean(errors.gradientColor)

  const problemCount = Object.keys(errors).length

  return (
    <form
      noValidate
      className="space-y-8"
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
      <CompactFieldsContext.Provider value={true}>
        <fieldset disabled={saving} className="min-w-0 space-y-8">
          <legend className="sr-only">Resume settings</legend>
          <section aria-labelledby="resumes-offer-heading" className="max-w-3xl">
            <h2 id="resumes-offer-heading" className="mb-4 flex items-center gap-2 text-lg font-semibold">
              <span className="rounded-md bg-blue-50 p-1.5 text-blue-700">
                <FileText size={18} aria-hidden />
              </span>
              Team member resumes
            </h2>
            {!saved && (
              <p className="mb-4 rounded-md border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700">
                These haven&apos;t been saved yet. Until you save them, Lumi offers resumes with neutral colours and your business name in the header.
              </p>
            )}
            <div className="flex items-start gap-3 rounded-md border border-slate-200 p-4">
              <Switch
                id="resumes-enabled"
                checked={form.enabled}
                onCheckedChange={(enabled) => update({ enabled })}
                aria-describedby="resumes-enabled-hint"
              />
              <div className="space-y-1">
                <Label htmlFor="resumes-enabled">Generate resumes</Label>
                <p id="resumes-enabled-hint" className="text-sm text-slate-600">
                  {form.enabled
                    ? "Visitors can download a PDF resume from team member cards in the chat, your website can link them, and your team can download them from the team members list."
                    : "When off, Lumi doesn't offer resumes: the chat and the team members list don't link them, and resume links, e.g. on your website, return not found. Your logo, colours and footer text are kept for when you turn resumes back on."}
                </p>
              </div>
            </div>
          </section>

          {showStyle && (
            <section aria-labelledby="resumes-style-heading">
              <div className="mb-6">
                <h2 id="resumes-style-heading" className="flex items-center gap-2 text-lg font-semibold">
                  <span className="rounded-md bg-blue-50 p-1.5 text-blue-700">
                    <Palette size={18} aria-hidden />
                  </span>
                  Logo, colours and footer
                </h2>
                <p className="text-sm text-slate-600">
                  Every resume uses them, in every language. Leave a colour empty for the neutral default. The chat&apos;s logo and colour are set in{" "}
                  <Link href="/admin/settings?tab=business" className="underline underline-offset-2">
                    Business identity
                  </Link>
                  .
                </p>
              </div>
              <div className="grid items-start gap-6 lg:grid-cols-2">
                <div className="min-w-0 space-y-8">
                  <SettingsGroup id="resumes-header" title="Header" description="The band at the top of every page.">
                    <LogoUploadField
                      label="Resume logo"
                      alt="Uploaded resume logo"
                      hint={LOGO_HINT}
                      uploadedHint={UPLOADED_LOGO_HINT}
                      placeholder="https://www.example.com/resume-logo.png"
                      value={form.logoUrl}
                      onChange={(value) => update({ logoUrl: value })}
                      errors={errors}
                      logo={logo}
                      disabled={busy}
                      background={headerColor === "invalid" ? DEFAULT_RESUME_COLORS.header : headerColor}
                      height={64}
                    />
                    <ColorField
                      field="headerColor"
                      label="Band colour"
                      hint="The background of the header band, behind the logo, and of the footer band, behind the footer text."
                      fallback={DEFAULT_RESUME_COLORS.header}
                      value={form.headerColor}
                      onChange={(value) => update({ headerColor: value })}
                      errors={errors}
                      status={headerStatus}
                    />
                  </SettingsGroup>
                  <SettingsGroup
                    id="resumes-headings"
                    title="Headings"
                    description="Section titles such as Summary and Contact, with the line below them."
                  >
                    <ColorField
                      field="accentColor"
                      label="Accent colour"
                      hint="Also colours the footer text."
                      fallback={DEFAULT_RESUME_COLORS.accent}
                      value={form.accentColor}
                      onChange={(value) => update({ accentColor: value })}
                      errors={errors}
                      status={accentStatus}
                    />
                  </SettingsGroup>
                  <SettingsGroup id="resumes-footer" title="Footer" description="The bottom of every page, with the date the resume was made.">
                    <TextField
                      field="footerText"
                      label="Footer text"
                      hint={`Optional, e.g. your website's address, in up to ${FOOTER_TEXT_MAX_LENGTH} characters. Shown large in the accent colour on the band colour, beside the date${websiteUrl ? ", and linked to your website" : ""}; long text is set smaller to fit on one line. Leave empty to show only the date.`}
                      placeholder={`e.g. ${websiteUrl ? displayUrl(websiteUrl) : "example.com"}`}
                      maxLength={FOOTER_TEXT_MAX_LENGTH}
                      value={form.footerText}
                      onChange={(value) => update({ footerText: value })}
                      errors={errors}
                    />
                    {showGradient && (
                      <ColorField
                        field="gradientColor"
                        label="Gradient colour"
                        hint="Optional: the footer text fades from this colour into the accent colour. Leave empty for the accent colour alone."
                        value={form.gradientColor}
                        onChange={(value) => update({ gradientColor: value })}
                        errors={errors}
                        status={gradientStatus}
                      />
                    )}
                  </SettingsGroup>
                </div>
                <ResumePreview form={form} businessName={businessName} />
              </div>
            </section>
          )}
        </fieldset>
      </CompactFieldsContext.Provider>

      {failure && (
        <p role="alert" className="text-sm font-medium text-red-700">
          {failure}
        </p>
      )}
      <div className="sticky bottom-0 z-10 -mx-4 flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 bg-white px-4 py-3 shadow-[0_-4px_12px_rgb(0_0_0/0.03)]">
        <div>
          <p role="status" className="text-sm font-medium">
            {saving ? "Saving changes…" : dirty ? "Unsaved changes" : saved ? "All changes saved" : "Not saved yet"}
          </p>
          <p className="text-xs text-slate-600">Changes apply to the next resume, and to chat pages from their next visit.</p>
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
              logo.discarded()
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
