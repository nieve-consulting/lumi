"use client"

import { useCallback } from "react"
import { useRouter } from "next/navigation"
import type { JobOpening } from "@/generated/graphql"
import { inSentence, JOB_WORK_MODE_LABELS, JOB_WORK_MODES, type JobWorkMode } from "@lumi/shared-contracts/knowledge"
import { DEFAULT_LANGUAGE, type Language } from "@lumi/shared-contracts/language"
import { DateTime } from "luxon"

import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form"
import { Input } from "@/components/ui/input"
import { LoadingButton, LoadingButtonState } from "@/components/ui/loading-button"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
import { Textarea } from "@/components/ui/textarea"
import { useToast } from "@/components/ui/use-toast"
import AiEditor from "@/components/MdEditor/AiEditor"
import { useSourceLabels } from "@/app/admin/components/SourceLabelsProvider"
import AiTranslateButton from "@/app/admin/components/translations/AiTranslateButton"
import EnglishFirstNote from "@/app/admin/components/translations/EnglishFirstNote"
import EnglishReference from "@/app/admin/components/translations/EnglishReference"
import EnglishText from "@/app/admin/components/translations/EnglishText"
import {
  assertTranslationSaved,
  contentValues,
  findTranslation,
  improvePromptIn,
  languageLabel,
  untranslatedAsNull,
  untranslatedPlaceholder,
} from "@/app/admin/components/translations/languages"
import LanguageSwitcher from "@/app/admin/components/translations/LanguageSwitcher"
import TranslationNotice from "@/app/admin/components/translations/TranslationNotice"
import { translatableFields, useAiTranslation } from "@/app/admin/components/translations/useAiTranslation"
import { useTranslatableForm } from "@/app/admin/components/translations/useTranslatableForm"

import { createJobOpening, updateJobOpening } from "../../actions"
import {
  jobOpeningContentFields,
  jobOpeningContentSchema,
  jobOpeningFieldDescriptions,
  jobOpeningOptionalContentFields,
  jobOpeningRecordKind,
  jobOpeningSchema,
  type JobOpeningFormSchema,
} from "./schema"

const improveDescriptionPrompt =
  "This text describes an open position at our company to job candidates: the role, its responsibilities, what we look for and what we offer. Address the candidate in the 2nd person"

// A posted date as the date input takes it (yyyy-MM-dd), today for a new job opening
function postedDate(postedAt: string | null | undefined) {
  const date = postedAt ? DateTime.fromISO(postedAt, { setZone: true }) : DateTime.now()
  return (date.isValid ? date : DateTime.now()).toISODate() ?? ""
}

const isWorkMode = (value: string | null | undefined): value is JobWorkMode => (JOB_WORK_MODES as readonly string[]).includes(value ?? "")

interface IProps {
  jobOpening?: JobOpening
  // Language the form opens in. New job openings are created in English
  language?: Language
}

// The form's values in a language: the shared fields, plus the job opening's content in that language. The job opening is
// read in English, so English takes its own fields
function jobOpeningFormValues(jobOpening: JobOpening | undefined, language: Language): JobOpeningFormSchema {
  const content =
    language === DEFAULT_LANGUAGE
      ? { title: jobOpening?.title || "", summary: jobOpening?.summary || "", description: jobOpening?.description || "" }
      : contentValues(findTranslation(jobOpening?.translations, language), jobOpeningContentFields)

  return {
    ...content,
    url_slug: jobOpening?.url_slug || "",
    location: jobOpening?.location || "",
    // A new job opening has none until the team picks one, which validation requires, so it's never published by default
    work_mode: isWorkMode(jobOpening?.work_mode) ? jobOpening.work_mode : ("" as JobWorkMode),
    application_url: jobOpening?.application_url || "",
    posted_at: postedDate(jobOpening?.posted_at),
    published: jobOpening?.published ?? false,
  }
}

export default function JobOpeningForm({ jobOpening, language: initialLanguage = DEFAULT_LANGUAGE }: IProps) {
  const { toast } = useToast()
  const router = useRouter()
  const labels = useSourceLabels().jobOpenings
  const label = labels.singular

  const startLanguage = jobOpening ? initialLanguage : DEFAULT_LANGUAGE
  const valuesFor = useCallback((language: Language) => jobOpeningFormValues(jobOpening, language), [jobOpening])
  const { form, contentLanguage, language, translating } = useTranslatableForm({
    schema: jobOpeningSchema,
    contentSchema: jobOpeningContentSchema,
    initialLanguage: startLanguage,
    valuesFor,
  })
  const aiTranslation = useAiTranslation({
    form,
    language,
    record: jobOpeningRecordKind,
    translations: jobOpening?.translations,
    fieldsIn: (from) => translatableFields<JobOpeningFormSchema>(valuesFor(from), jobOpeningFieldDescriptions),
  })

  async function onSubmit(data: JobOpeningFormSchema) {
    try {
      if (jobOpening && translating) {
        // Saves the content in the language being edited, and only that language. Shared fields are sent as the API
        // requires them, which it ignores
        const input = untranslatedAsNull(data, jobOpeningOptionalContentFields, language)
        assertTranslationSaved(await updateJobOpening(jobOpening.id, input, language), language)
        toast({ title: `${languageLabel(language)} translation of ${jobOpening.title} saved` })
      } else if (jobOpening) {
        if (!(await updateJobOpening(jobOpening.id, data))) {
          throw new Error(`${jobOpening.title} couldn't be updated. Check the fields and try again.`)
        }
        toast({ title: `${data.title} has been updated` })
      } else {
        if (!(await createJobOpening(data))) {
          throw new Error(`Error creating ${inSentence(label)}`)
        }
        toast({ title: `${data.title} has been created` })
      }

      router.replace("/admin/job-openings")
    } catch (e) {
      const err = e as Error
      toast({
        variant: "destructive",
        title: "Error",
        description: err.message,
      })
    }
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8">
        {jobOpening ? (
          <div className="space-y-3">
            <LanguageSwitcher control={contentLanguage} translations={jobOpening.translations}>
              <AiTranslateButton control={aiTranslation} />
            </LanguageSwitcher>
            <TranslationNotice language={language} translations={jobOpening.translations} required={["Title", "Summary"]} />
          </div>
        ) : (
          <EnglishFirstNote />
        )}
        <FormField
          control={form.control}
          name="title"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Title</FormLabel>
              <FormControl>
                <Input
                  {...field}
                  placeholder={untranslatedPlaceholder(language, jobOpening?.title, { required: true, placeholder: "e.g. Senior Product Designer" })}
                />
              </FormControl>
              <EnglishText language={language} text={jobOpening?.title} />
              <FormMessage />
            </FormItem>
          )}
        />
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField
            control={form.control}
            name="url_slug"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Url Slug</FormLabel>
                <FormControl>
                  <Input {...field} disabled={translating} />
                </FormControl>
                <FormDescription>Where your website shows this {inSentence(label)}, e.g. senior-product-designer</FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="location"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Location</FormLabel>
                <FormControl>
                  <Input {...field} placeholder="e.g. Madrid" disabled={translating} />
                </FormControl>
                <FormDescription>Shown as written in every language</FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="work_mode"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Work mode</FormLabel>
                <Select value={field.value} onValueChange={field.onChange} disabled={translating}>
                  <FormControl>
                    <SelectTrigger ref={field.ref} onBlur={field.onBlur} className="w-full">
                      <SelectValue placeholder="Choose a work mode" />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    {JOB_WORK_MODES.map((mode) => (
                      <SelectItem key={mode} value={mode}>
                        {JOB_WORK_MODE_LABELS[mode]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="posted_at"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Posted on</FormLabel>
                <FormControl>
                  <Input {...field} type="date" className="w-full sm:w-48" disabled={translating} />
                </FormControl>
                <FormDescription>Lists are sorted by this date, most recent first</FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>
        <FormField
          control={form.control}
          name="application_url"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Application link (optional)</FormLabel>
              <FormControl>
                <Input {...field} type="url" placeholder="https://" disabled={translating} />
              </FormControl>
              <FormDescription>
                Where candidates apply for this {inSentence(label)}. Without one, Lumi links to the careers page in your business settings; if
                that&apos;s empty too, candidates get no link.
              </FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="published"
          render={({ field }) => (
            <FormItem>
              <div className="flex items-center space-x-2">
                <FormLabel>Published</FormLabel>
                <FormControl>
                  <Switch checked={field.value} onCheckedChange={field.onChange} disabled={translating} />
                </FormControl>
              </div>
              <FormDescription>Show this record in the public chatbot, on your website and to anonymous ChatGPT users.</FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="summary"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Summary</FormLabel>
              <FormControl>
                <Textarea {...field} rows={3} placeholder={untranslatedPlaceholder(language, jobOpening?.summary, { required: true })} />
              </FormControl>
              <FormDescription>
                One or two sentences about the role, shown wherever candidates browse your {inSentence(labels.plural)}
              </FormDescription>
              <EnglishReference language={language} text={jobOpening?.summary} />
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="description"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Description</FormLabel>
              <FormControl>
                <AiEditor
                  {...field}
                  className="h-80"
                  prompt={improvePromptIn(improveDescriptionPrompt, language)}
                  placeholder={untranslatedPlaceholder(language, jobOpening?.description)}
                />
              </FormControl>
              <FormDescription>The role, its responsibilities, what you look for and what you offer</FormDescription>
              <EnglishReference language={language} text={jobOpening?.description} />
              <FormMessage />
            </FormItem>
          )}
        />
        <div className="w-full text-right">
          <LoadingButton
            state={form.formState.isSubmitting ? LoadingButtonState.Loading : LoadingButtonState.Idle}
            type="submit"
            // Saving while the AI translation runs would save the text from before it and drop the translation
            disabled={aiTranslation.pending !== null}
            text={translating ? `Save ${languageLabel(language)} translation` : `${jobOpening ? "Update" : "Create"} ${inSentence(label)}`}
            loadingText={translating ? "Saving..." : `${jobOpening ? "Updating" : "Creating"}...`}
          />
        </div>
      </form>
    </Form>
  )
}
