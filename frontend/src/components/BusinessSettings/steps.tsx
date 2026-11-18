"use client"

import {
  DEFAULT_ASSISTANT_NAME,
  GREETING_MAX_LENGTH,
  MAX_STARTERS,
  MIN_PRIMARY_CONTRAST,
  parseHexColor,
  STARTER_ICONS,
  whiteTextContrast,
} from "@lumi/shared-contracts/business"
import { LANGUAGES, type Language } from "@lumi/shared-contracts/language"
import { greeting as builtInGreeting } from "@lumi/shared-contracts/pre-sales"
import { Plus, Trash2 } from "lucide-react"

import { DEFAULT_PRIMARY_COLOR } from "@/lib/businessSettings"
import { getMessages } from "@/lib/i18n"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { STARTER_ICON_COMPONENTS, STARTER_ICON_NAMES } from "@/components/Chat/starterIcons"

import AppearancePreview from "./AppearancePreview"
import { describedBy, FieldError, FieldHint, FieldLabel, SelectField, TextAreaField, TextField } from "./fields"
import { emptyStarter, fieldId, type BusinessForm, type FieldErrors, type StarterForm, type StartersMode } from "./form"

// The steps of the onboarding wizard, which the admin settings show as sections. A new step adds its component and its
// entry to BUSINESS_STEPS, naming the fields it edits so their problems show with it

export interface StepProps {
  form: BusinessForm
  update: (patch: Partial<BusinessForm>) => void
  errors: FieldErrors
  // The admin settings, which lay the default language and the appearance preview out in their own places
  admin?: boolean
}

export interface BusinessStep {
  id: string
  title: string
  description: string
  // The settings it edits, as problems name them; a field covers what's under it, e.g. starters.0.label.en
  fields: readonly string[]
  Component: (props: StepProps) => React.ReactNode
  // What the review shows of it
  summary: (form: BusinessForm) => { label: string; value: string }[]
}

const IMAGE_HINT = "Use an HTTPS image URL or a site path starting with /."

// Languages by their English names, like the rest of the forms
const englishNames = new Intl.DisplayNames(["en"], { type: "language" })
const languageName = (language: Language) => englishNames.of(language) ?? language

export const languageOptions = LANGUAGES.map((language) => ({ value: language, label: languageName(language) }))

const orNotSet = (value: string) => value.trim() || "Not set"

export function BusinessStepFields({ form, update, errors }: StepProps) {
  return (
    <>
      <TextField
        field="businessName"
        label="Business name"
        hint="Shown to visitors and used by the assistant."
        required
        maxLength={100}
        autoComplete="organization"
        value={form.businessName}
        onChange={(businessName) => update({ businessName })}
        errors={errors}
      />
      <TextField
        field="websiteUrl"
        label="Website"
        hint="Linked from the chat page and the resumes it offers."
        type="url"
        placeholder="https://www.example.com"
        value={form.websiteUrl}
        onChange={(websiteUrl) => update({ websiteUrl })}
        errors={errors}
      />
      <TextField
        field="careersUrl"
        label="Careers page"
        hint="Linked from job opening cards that have no application link of their own."
        type="url"
        placeholder="https://www.example.com/careers"
        value={form.careersUrl}
        onChange={(careersUrl) => update({ careersUrl })}
        errors={errors}
      />
    </>
  )
}

export function ContactStepFields({ form, update, errors }: StepProps) {
  return (
    <>
      <p className="text-sm text-slate-600">Public contact details used by chat links and resumes. Company knowledge is maintained separately.</p>
      <TextField
        field="contactUrl"
        label="Contact page"
        type="url"
        placeholder="https://www.example.com/contact"
        value={form.contactUrl}
        onChange={(contactUrl) => update({ contactUrl })}
        errors={errors}
      />
      <TextField
        field="contactEmail"
        label="Public contact email"
        type="email"
        autoComplete="email"
        placeholder="hello@example.com"
        value={form.contactEmail}
        onChange={(contactEmail) => update({ contactEmail })}
        errors={errors}
      />
      <TextField
        field="contactPhone"
        label="Public contact phone"
        hint="Include the country code, e.g. +34 610 096 740. Shown on resumes."
        type="tel"
        autoComplete="tel"
        value={form.contactPhone}
        onChange={(contactPhone) => update({ contactPhone })}
        errors={errors}
      />
    </>
  )
}

export function AssistantStepFields({ form, update, errors, admin }: StepProps) {
  return (
    <>
      <TextField
        field="assistantName"
        label="Assistant name"
        hint={`The name visitors see in the chat and its greeting. Leave empty for ${DEFAULT_ASSISTANT_NAME}.`}
        placeholder={DEFAULT_ASSISTANT_NAME}
        maxLength={40}
        value={form.assistantName}
        onChange={(assistantName) => update({ assistantName })}
        errors={errors}
      />
      <TextField
        field="avatarUrl"
        label="Assistant picture"
        hint={`A square image works best. ${IMAGE_HINT} Leave empty for ${DEFAULT_ASSISTANT_NAME}'s own picture.`}
        type="url"
        placeholder="https://www.example.com/assistant.png"
        value={form.avatarUrl}
        onChange={(avatarUrl) => update({ avatarUrl })}
        errors={errors}
      />
      {!admin && <DefaultLanguageField form={form} update={update} errors={errors} />}
    </>
  )
}

// In the wizard's assistant step, and in the admin settings' conversation section
export function DefaultLanguageField({ form, update, errors }: StepProps) {
  return (
    <SelectField
      field="defaultLanguage"
      label="Default language"
      hint="Used when no visitor or page language is selected."
      required
      value={form.defaultLanguage}
      onChange={(defaultLanguage) => update({ defaultLanguage: defaultLanguage as Language })}
      options={languageOptions}
      errors={errors}
    />
  )
}

// The admin settings pass their own logo field, which can also upload the logo; the onboarding wizard takes its address
export function BrandingStepFields({ form, update, errors, admin, logoField }: StepProps & { logoField?: React.ReactNode }) {
  const hex = parseHexColor(form.primaryColor)
  const contrast = hex ? whiteTextContrast(hex) : undefined
  const readable = contrast !== undefined && contrast >= MIN_PRIMARY_CONTRAST
  const field = "primaryColor"
  const hint = "Used for buttons, visitor messages and the launcher. Leave empty for default blue."

  return (
    <>
      {logoField ?? (
        <TextField
          field="logoUrl"
          label="Logo"
          hint={`Shown in the chat's About dialog. ${IMAGE_HINT} Or leave it empty and upload one later in Settings → Business identity → Appearance.`}
          type="url"
          placeholder="https://www.example.com/logo.svg"
          value={form.logoUrl}
          onChange={(logoUrl) => update({ logoUrl })}
          errors={errors}
        />
      )}
      <div className="space-y-2">
        <FieldLabel field={field} label="Primary colour" />
        <FieldHint field={field}>{hint}</FieldHint>
        <div className="flex items-center gap-3">
          <Input
            id={fieldId(field)}
            value={form.primaryColor}
            onChange={(event) => update({ primaryColor: event.target.value })}
            placeholder="#1d4ed8"
            autoComplete="off"
            spellCheck={false}
            maxLength={7}
            aria-invalid={errors[field] ? true : undefined}
            aria-describedby={[describedBy(field, errors, hint), `${fieldId(field)}-contrast`].filter(Boolean).join(" ")}
            className="w-32 font-mono"
          />
          <input
            type="color"
            aria-label="Pick the primary colour"
            value={hex ?? DEFAULT_PRIMARY_COLOR}
            onChange={(event) => update({ primaryColor: event.target.value })}
            className="h-10 w-14 cursor-pointer rounded-md border border-slate-300 bg-white p-1"
          />
        </div>
        {/* Announced as the colour changes */}
        <p
          id={`${fieldId(field)}-contrast`}
          role="status"
          className={readable || !hex ? "text-sm text-slate-600" : "text-sm font-medium text-red-700"}
        >
          {/* The field's error says it once the visitor tries to go on */}
          {hex &&
            !errors[field] &&
            (readable
              ? `Contrast with white text: ${contrast?.toFixed(1)}:1, readable (at least ${MIN_PRIMARY_CONTRAST}:1).`
              : `Contrast with white text: ${contrast?.toFixed(1)}:1, too light (needs at least ${MIN_PRIMARY_CONTRAST}:1). Pick a darker colour.`)}
        </p>
        <FieldError field={field} errors={errors} />
      </div>
      {/* The admin settings show it beside the appearance fields */}
      {!admin && (
        <div className="max-w-xl">
          <AppearancePreview form={form} />
        </div>
      )}
    </>
  )
}

const ADD_STARTER_ID = "business-add-starter"

const STARTER_MODES: { value: StartersMode; label: string; description: string }[] = [
  {
    value: "builtIn",
    label: "Use default suggestions",
    description:
      "Suggestions for clients, visitors and job candidates. The ones about your work and job openings show only while those knowledge sources are on.",
  },
  { value: "custom", label: "Write your own", description: `Up to ${MAX_STARTERS} suggestions you write.` },
  { value: "none", label: "No suggestions", description: "Visitors start by typing a message." },
]

function StarterFields({ form, update, errors, index }: StepProps & { index: number }) {
  const starter = form.starters[index]
  const set = (patch: Partial<StarterForm>) => update({ starters: form.starters.map((other, i) => (i === index ? { ...other, ...patch } : other)) })
  const setText = (key: "label" | "message", language: Language, text: string) => set({ [key]: { ...starter[key], [language]: text } })
  // The default language first: the others fall back to it
  const languages = [form.defaultLanguage, ...LANGUAGES.filter((language) => language !== form.defaultLanguage)]
  const Icon = starter.icon ? STARTER_ICON_COMPONENTS[starter.icon] : undefined

  return (
    <fieldset className="space-y-4 rounded-md border border-slate-200 p-4">
      <legend className="px-1 font-medium">Starter {index + 1}</legend>
      <div className="flex items-end gap-3">
        <SelectField
          field={`starters.${index}.icon`}
          label="Icon"
          value={starter.icon}
          onChange={(icon) => set({ icon: icon as StarterForm["icon"] })}
          options={[{ value: "", label: "No icon" }, ...STARTER_ICONS.map((icon) => ({ value: icon, label: STARTER_ICON_NAMES[icon] }))]}
          errors={errors}
        />
        <span className="mb-2 flex size-8 items-center justify-center rounded-md border border-slate-200 bg-white" aria-hidden>
          {Icon && <Icon size={18} />}
        </span>
      </div>
      {languages.map((language) => {
        const isDefault = language === form.defaultLanguage
        const fallbackHint = isDefault ? undefined : `Leave empty to show the ${languageName(form.defaultLanguage)} text.`
        return (
          <div key={language} className="space-y-3">
            <TextField
              field={`starters.${index}.label.${language}`}
              label={`Button text in ${languageName(language)}`}
              hint={fallbackHint}
              required={isDefault}
              maxLength={40}
              value={starter.label[language]}
              onChange={(text) => setText("label", language, text)}
              errors={errors}
            />
            <TextAreaField
              field={`starters.${index}.message.${language}`}
              label={`Message in ${languageName(language)}`}
              hint={isDefault ? "Sent as the visitor's first message when they choose the button." : fallbackHint}
              required={isDefault}
              rows={2}
              maxLength={500}
              value={starter.message[language]}
              onChange={(text) => setText("message", language, text)}
              errors={errors}
            />
          </div>
        )
      })}
      {form.starters.length > 1 && (
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => {
            update({ starters: form.starters.filter((_, i) => i !== index) })
            // The button may go with its starter, so focus moves to adding one. After rendering: at the most starters the add
            // button is disabled until this one is gone
            requestAnimationFrame(() => document.getElementById(ADD_STARTER_ID)?.focus())
          }}
        >
          <Trash2 aria-hidden /> Remove starter {index + 1}
        </Button>
      )}
    </fieldset>
  )
}

// The assistant's first message in each language, the default language first as the others fall back to it. Empty in every
// language, the chat shows the built-in greeting, which the placeholders show
export function GreetingFields({ form, update, errors }: StepProps) {
  const languages = [form.defaultLanguage, ...LANGUAGES.filter((language) => language !== form.defaultLanguage)]
  const assistantName = form.assistantName.trim() || DEFAULT_ASSISTANT_NAME
  const anyText = LANGUAGES.some((language) => form.greeting[language].trim())

  return (
    <fieldset className="space-y-4">
      <legend className="mb-1 text-sm font-medium">Greeting</legend>
      <p className="text-sm text-slate-600">
        The assistant&apos;s first message in every conversation. Leave every language empty to use the built-in greeting, shown as the placeholder.
        It&apos;s plain text: include the assistant&apos;s name yourself, and update it if you rename the assistant.
      </p>
      {languages.map((language) => {
        const isDefault = language === form.defaultLanguage
        return (
          <TextAreaField
            key={language}
            field={`greeting.${language}`}
            label={`Greeting in ${languageName(language)}`}
            hint={
              !anyText
                ? undefined
                : isDefault
                  ? "Required while any language has a greeting: the others fall back to it."
                  : `Leave empty to show ${languageName(language)} visitors the ${languageName(form.defaultLanguage)} greeting.`
            }
            required={isDefault && anyText}
            rows={3}
            maxLength={GREETING_MAX_LENGTH}
            placeholder={anyText ? undefined : builtInGreeting(language, { assistantName })}
            value={form.greeting[language]}
            onChange={(text) => update({ greeting: { ...form.greeting, [language]: text } })}
            errors={errors}
          />
        )
      })}
    </fieldset>
  )
}

// The wizard's step for how the chat opens: the greeting, then the starters
function OpeningStepFields(props: StepProps) {
  return (
    <>
      <GreetingFields {...props} />
      <div className="border-t border-slate-200 pt-5">
        <StartersStepFields {...props} />
      </div>
    </>
  )
}

export function StartersStepFields(props: StepProps) {
  const { form, update, errors } = props
  const builtIn = getMessages(form.defaultLanguage, { assistantName: DEFAULT_ASSISTANT_NAME, businessName: "" }).starters

  return (
    <>
      <fieldset className="space-y-2" aria-describedby={errors.starters ? `${fieldId("starters")}-error` : undefined}>
        <legend className="mb-2 text-sm font-medium">Suggested first messages</legend>
        {STARTER_MODES.map((mode) => (
          <label key={mode.value} className="flex items-start gap-2 text-sm">
            <input
              type="radio"
              name="startersMode"
              value={mode.value}
              checked={form.startersMode === mode.value}
              onChange={() => update({ startersMode: mode.value, starters: form.starters.length ? form.starters : [emptyStarter()] })}
              className="mt-0.5 size-4 accent-blue-700"
            />
            <span>
              <span className="font-medium">{mode.label}</span>
              <span className="block text-slate-600">{mode.description}</span>
            </span>
          </label>
        ))}
        <FieldError field="starters" errors={errors} />
      </fieldset>
      {form.startersMode === "builtIn" && (
        <div className="flex flex-wrap gap-2" aria-label="Default conversation starters">
          {[builtIn.discussProject.label, builtIn.exploreWork.label, builtIn.findJobs.label].map((label) => (
            <span key={label} className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm">
              {label}
            </span>
          ))}
        </div>
      )}
      {form.startersMode === "custom" && (
        <div className="space-y-4">
          {form.starters.map((_, index) => (
            <StarterFields key={index} {...props} index={index} />
          ))}
          <Button
            id={ADD_STARTER_ID}
            type="button"
            variant="outline"
            size="sm"
            disabled={form.starters.length >= MAX_STARTERS}
            onClick={() => {
              update({ starters: [...form.starters, emptyStarter()] })
              // To the new starter's first field
              const added = form.starters.length
              requestAnimationFrame(() => document.getElementById(fieldId(`starters.${added}.icon`))?.focus())
            }}
          >
            <Plus aria-hidden /> Add a starter
          </Button>
          {form.starters.length >= MAX_STARTERS && <p className="text-sm text-slate-600">That&apos;s the most the chat shows ({MAX_STARTERS}).</p>}
        </div>
      )}
    </>
  )
}

export function AgentStepFields({ form, update, errors }: StepProps) {
  return (
    <>
      <p className="rounded-md border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700">
        Used to guide replies. The assistant may repeat this information; don&apos;t include confidential details. Its built-in rules still apply.
      </p>
      <TextAreaField
        field="agentDescription"
        label="What your business provides"
        hint="Completes “…representing your business, a provider of …” in the assistant's introduction, e.g. software development services for retailers."
        rows={2}
        maxLength={300}
        value={form.agentDescription}
        onChange={(agentDescription) => update({ agentDescription })}
        errors={errors}
      />
      <TextAreaField
        field="agentGuidance"
        label="Guidance for the assistant"
        hint="Anything it should know or do in every conversation, e.g. where you work or what to mention when asked about prices."
        rows={6}
        maxLength={2000}
        value={form.agentGuidance}
        onChange={(agentGuidance) => update({ agentGuidance })}
        errors={errors}
      />
    </>
  )
}

export const BUSINESS_STEPS: readonly BusinessStep[] = [
  {
    id: "business",
    title: "Business",
    description: "Who visitors are talking to.",
    fields: ["businessName", "websiteUrl", "careersUrl"],
    Component: BusinessStepFields,
    summary: (form) => [
      { label: "Business name", value: orNotSet(form.businessName) },
      { label: "Website", value: orNotSet(form.websiteUrl) },
      { label: "Careers page", value: orNotSet(form.careersUrl) },
    ],
  },
  {
    id: "contact",
    title: "Contact",
    description: "How visitors reach your team.",
    fields: ["contactUrl", "contactEmail", "contactPhone"],
    Component: ContactStepFields,
    summary: (form) => [
      { label: "Contact page", value: orNotSet(form.contactUrl) },
      { label: "Contact email", value: orNotSet(form.contactEmail) },
      { label: "Contact phone", value: orNotSet(form.contactPhone) },
    ],
  },
  {
    id: "assistant",
    title: "Assistant",
    description: "Who visitors chat with.",
    fields: ["assistantName", "avatarUrl", "defaultLanguage"],
    Component: AssistantStepFields,
    summary: (form) => [
      { label: "Assistant name", value: form.assistantName.trim() || DEFAULT_ASSISTANT_NAME },
      { label: "Assistant picture", value: form.avatarUrl.trim() || `${DEFAULT_ASSISTANT_NAME}'s own` },
      { label: "Default language", value: languageName(form.defaultLanguage) },
    ],
  },
  {
    id: "branding",
    title: "Branding",
    description: "How the chat looks.",
    fields: ["logoUrl", "primaryColor"],
    Component: BrandingStepFields,
    summary: (form) => [
      { label: "Logo", value: orNotSet(form.logoUrl) },
      { label: "Primary colour", value: form.primaryColor.trim() || "Default blue" },
    ],
  },
  {
    id: "starters",
    title: "Greeting and starters",
    description: "How the chat opens: the assistant's first message and what it suggests visitors ask.",
    fields: ["greeting", "starters"],
    Component: OpeningStepFields,
    summary: (form) => [
      { label: "Greeting", value: form.greeting[form.defaultLanguage].trim() || "The built-in one" },
      {
        label: "Starters",
        value:
          form.startersMode === "builtIn"
            ? "The chat's own"
            : form.startersMode === "none"
              ? "None"
              : form.starters.map((starter) => starter.label[form.defaultLanguage].trim() || "(no text)").join(", "),
      },
    ],
  },
  {
    id: "agent",
    title: "Assistant guidance",
    description: "Private guidance for the assistant.",
    fields: ["agentDescription", "agentGuidance"],
    Component: AgentStepFields,
    summary: (form) => [
      { label: "What your business provides", value: orNotSet(form.agentDescription) },
      { label: "Guidance", value: orNotSet(form.agentGuidance) },
    ],
  },
]

// The step a field belongs to
export const stepOfField = (field: string) =>
  BUSINESS_STEPS.findIndex((step) => step.fields.some((prefix) => field === prefix || field.startsWith(`${prefix}.`)))
