"use client"

import { useState } from "react"
import Link from "next/link"
import type { KnowledgeSources } from "@/generated/graphql"
import {
  DEFAULT_SOURCE_LABELS,
  SOURCE_LABEL_MAX_LENGTH,
  sourceLabelSchema,
  type SourceKey,
  type SourceLabel,
  type SourceLabels,
  type StructuredSources,
} from "@lumi/shared-contracts/knowledge"
import { Layers } from "lucide-react"

import { labelsOf } from "@/lib/knowledgeSources"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { useToast } from "@/components/ui/use-toast"

import { useLeaveWarning } from "../useLeaveWarning"
import { updateStructuredSources } from "./actions"

// Each source by its generic name, whatever the installation calls it
const SOURCES: { key: SourceKey; description: string }[] = [
  {
    key: "teamMembers",
    description:
      "Profiles of the people on your team. Lumi can introduce them and suggest who to talk to. While off, public résumé links (e.g. on your website) stop working.",
  },
  {
    key: "projects",
    description:
      'Case studies of your work. Lumi can mention them as examples of what you do, and the chat\'s default suggestions include "Explore our work".',
  },
  {
    key: "clients",
    description: "Companies you've worked with. Lumi can mention them as references.",
  },
  {
    key: "capabilities",
    description: "Skills, specialities or practice areas of your team members and projects. Lumi can say who has them and where you've used them.",
  },
  {
    key: "jobOpenings",
    description:
      "Open positions you're recruiting for. Lumi can tell job candidates about them and where to apply, and the chat's default suggestions include \"Find job opportunities\".",
  },
]

const LABEL_FORMS: { form: keyof SourceLabel; label: string; example: (defaults: SourceLabel) => string }[] = [
  { form: "singular", label: "Singular", example: (defaults) => defaults.singular },
  { form: "plural", label: "Plural", example: (defaults) => defaults.plural },
]

type SourcesForm = StructuredSources & { labels: SourceLabels }

// Problems by field, as the API names them: "labels.teamMembers.plural"
type FieldErrors = Record<string, string>

const formOf = (sources: KnowledgeSources): SourcesForm => ({
  teamMembers: sources.teamMembers,
  projects: sources.projects,
  clients: sources.clients,
  capabilities: sources.capabilities,
  jobOpenings: sources.jobOpenings,
  labels: labelsOf(sources),
})

const labelField = (key: SourceKey, form: keyof SourceLabel) => `labels.${key}.${form}`
const labelId = (field: string) => `source-${field.replaceAll(".", "-")}`

// The labels checked as the API checks them: each problem by field, and the trimmed labels when there are none
function validateLabels(labels: SourceLabels): { errors: FieldErrors; labels?: SourceLabels } {
  const errors: FieldErrors = {}
  const valid: Partial<SourceLabels> = {}
  for (const { key } of SOURCES) {
    const parsed = sourceLabelSchema.safeParse(labels[key])
    if (parsed.success) valid[key] = parsed.data
    else for (const issue of parsed.error.issues) errors[labelField(key, issue.path[0] as keyof SourceLabel)] ??= issue.message
  }
  return Object.keys(errors).length ? { errors } : { errors, labels: valid as SourceLabels }
}

interface IProps {
  sources: KnowledgeSources
}

export default function KnowledgeSourcesForm({ sources }: IProps) {
  const { toast } = useToast()
  const [form, setForm] = useState(() => formOf(sources))
  const [savedForm, setSavedForm] = useState(() => formOf(sources))
  const [saved, setSaved] = useState(sources.saved)
  const [saving, setSaving] = useState(false)
  const [failure, setFailure] = useState<string>()
  const [errors, setErrors] = useState<FieldErrors>({})

  const dirty = JSON.stringify(form) !== JSON.stringify(savedForm)

  useLeaveWarning(dirty, "Leave without saving your knowledge sources? Your changes will be lost.")

  function setLabel(key: SourceKey, labelForm: keyof SourceLabel, text: string) {
    const next = { ...form, labels: { ...form.labels, [key]: { ...form.labels[key], [labelForm]: text } } }
    setForm(next)
    // Problems already shown clear as they're fixed
    const field = labelField(key, labelForm)
    if (errors[field] && !validateLabels(next.labels).errors[field]) {
      setErrors(Object.fromEntries(Object.entries(errors).filter(([other]) => other !== field)))
    }
  }

  // Shows the problems and moves focus to the first
  function showProblems(problems: FieldErrors) {
    setErrors(problems)
    const [first] = Object.keys(problems)
    if (first) requestAnimationFrame(() => document.getElementById(labelId(first))?.focus())
  }

  async function save() {
    // Until first saved, saving keeps the values derived from published records
    if (saving || (!dirty && saved)) return
    setFailure(undefined)
    const checked = validateLabels(form.labels)
    if (!checked.labels) return showProblems(checked.errors)

    setSaving(true)
    try {
      const result = await updateStructuredSources({ ...form, labels: checked.labels })
      if (result.ok) {
        const next = formOf(result.sources)
        setForm(next)
        setSavedForm(next)
        setSaved(result.sources.saved)
        setErrors({})
        toast({ title: "Knowledge sources saved", description: "The admin is updated. New conversations use them within a minute." })
      } else if ("problems" in result) {
        const problems: FieldErrors = {}
        for (const { field, message } of result.problems) problems[field] ??= message
        showProblems(problems)
      } else {
        setFailure(result.error)
      }
    } catch (error) {
      console.error("Saving the knowledge sources failed", error)
      setFailure("The knowledge sources couldn't be saved. Try again in a moment.")
    } finally {
      setSaving(false)
    }
  }

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
      <p className="max-w-3xl text-sm text-slate-700">
        Lumi always answers from your{" "}
        <Link href="/admin/websites" className="font-medium text-blue-700 underline">
          websites
        </Link>
        , including any articles published on them.
      </p>

      <section aria-labelledby="structured-sources-heading" className="max-w-3xl">
        <div className="mb-4">
          <h2 id="structured-sources-heading" className="flex items-center gap-2 text-lg font-semibold">
            <span className="rounded-md bg-blue-50 p-1.5 text-blue-700">
              <Layers size={18} aria-hidden />
            </span>
            Structured sources
          </h2>
          <p className="text-sm text-slate-600">
            Turning a source off hides it from the admin, and Lumi stops offering or mentioning it. Its records are kept, so you can turn it back on
            at any time.
          </p>
          <p className="mt-2 text-sm text-slate-600">
            Name each source in English: the admin shows these names, and Lumi uses them with visitors, translating them when visitors write in
            another language. Use sentence case, e.g. Practice area; capitals are kept mid-sentence only for names and acronyms.
          </p>
        </div>
        {!saved && (
          <p className="mb-4 rounded-md border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700">
            These haven&apos;t been saved yet. Until you save them, a source is on when it has published records and off when it has none.
          </p>
        )}
        <fieldset disabled={saving} className="space-y-4">
          <legend className="sr-only">Structured sources Lumi answers from, and what your business calls them</legend>
          {SOURCES.map(({ key, description }) => {
            const defaults = DEFAULT_SOURCE_LABELS[key]
            return (
              <div key={key} className="space-y-4 rounded-md border border-slate-200 p-4">
                <div className="flex items-start gap-3">
                  <Switch
                    id={`source-${key}`}
                    checked={form[key]}
                    onCheckedChange={(checked) => setForm({ ...form, [key]: checked })}
                    aria-describedby={`source-${key}-hint`}
                  />
                  <div className="space-y-1">
                    <Label htmlFor={`source-${key}`}>{defaults.plural}</Label>
                    <p id={`source-${key}-hint`} className="text-sm text-slate-600">
                      {description}
                    </p>
                  </div>
                </div>
                <div role="group" aria-labelledby={`source-${key}-names`} className="space-y-2 sm:ml-12">
                  <p id={`source-${key}-names`} className="text-sm font-medium text-slate-700">
                    What you call {defaults.plural.toLowerCase()}
                  </p>
                  <div className="grid gap-4 sm:grid-cols-2">
                    {LABEL_FORMS.map(({ form: labelForm, label, example }) => {
                      const field = labelField(key, labelForm)
                      const id = labelId(field)
                      return (
                        <div key={labelForm} className="space-y-2">
                          <Label htmlFor={id}>{label}</Label>
                          <Input
                            id={id}
                            value={form.labels[key][labelForm]}
                            onChange={(event) => setLabel(key, labelForm, event.target.value)}
                            placeholder={example(defaults)}
                            maxLength={SOURCE_LABEL_MAX_LENGTH}
                            autoComplete="off"
                            aria-required
                            aria-invalid={errors[field] ? true : undefined}
                            aria-describedby={errors[field] ? `${id}-error` : undefined}
                          />
                          {errors[field] && (
                            <p id={`${id}-error`} className="text-sm font-medium text-red-700">
                              {errors[field]}
                            </p>
                          )}
                        </div>
                      )
                    })}
                  </div>
                </div>
              </div>
            )
          })}
        </fieldset>
      </section>

      {problemCount > 0 && (
        <p role="alert" className="text-sm font-medium text-red-700">
          {problemCount === 1 ? "One name needs fixing." : `${problemCount} names need fixing.`}
        </p>
      )}
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
            }}
          >
            Discard
          </Button>
          <Button type="submit" disabled={saving || (!dirty && saved)}>
            {saving ? "Saving…" : "Save changes"}
          </Button>
        </div>
      </div>
    </form>
  )
}
