import { useEffect, useState } from "react"
import type { Experience, Maybe } from "@/generated/graphql"
import { DEFAULT_LANGUAGE, type Language } from "@lumi/shared-contracts/language"
import { Building, ChevronDown, CirclePlus, Trash } from "lucide-react"
import { DateTime } from "luxon"
import { useFieldArray, useWatch, type UseFormReturn } from "react-hook-form"

import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible"
import { FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form"
import { Input } from "@/components/ui/input"
import FileUpload from "@/components/FileUpload"
import AiEditor from "@/components/MdEditor/AiEditor"
import MonthYearPicker from "@/components/MonthYearPicker"
import EnglishReference from "@/app/admin/components/translations/EnglishReference"
import EnglishText from "@/app/admin/components/translations/EnglishText"
import { improvePromptIn, translationStatus, untranslatedPlaceholder } from "@/app/admin/components/translations/languages"
import TranslationStatusBadge, { AiTranslatedBadge } from "@/app/admin/components/translations/TranslationStatusBadge"

import type { TeamMemberFormSchema } from "./schema"

const improvePrompts = {
  description: "Shorten and improve this text to be used in a team member's work experience",
}

// Experience inputs a failed submit can focus, in the order they are shown
const focusableFields = ["company", "position", "location"] as const

interface IProps {
  form: UseFormReturn<TeamMemberFormSchema>
  // Language being edited. Outside English only the position and description are edited: the rest is shared
  language?: Language
  // The team member's saved experiences, read in English with their translations
  experiences?: Maybe<Maybe<Experience>[]>
  // Called with a saved experience's id when it is opened, to review its translation, or closed
  onOpenChange?: (experienceId: string, open: boolean) => void
  // Whether a saved experience was filled by the AI translation and not opened since
  aiTranslated?: (experienceId: string) => boolean
  // Changes when the picked logos are removed, which remounts the logo pickers so their previews go too
  imageReset?: number
}

interface ISummaryProps {
  form: UseFormReturn<TeamMemberFormSchema>
  index: number
  // The field array's item, whose dates and company the summary shows
  experience: { start_date: Date; end_date?: Date | null; company: string }
  fallbackPosition?: string
}

// An experience's header text with its current position: the field array's own values don't follow edits or the AI
// translation. Watching only this position keeps typing elsewhere in the form from rendering every experience again
function ExperienceSummary({ form, index, experience, fallbackPosition }: ISummaryProps) {
  const position = useWatch({ control: form.control, name: `experiences.${index}.position` }) || fallbackPosition
  if (!position) return <i>Enter data</i>

  const start = DateTime.fromJSDate(experience.start_date).toFormat("yyyy")
  const end = experience.end_date ? DateTime.fromJSDate(experience.end_date).toFormat("yyyy") : "Present"
  return <>{`${start} - ${end} | ${position} @ ${experience.company}`}</>
}

export default function Experiences({ form, language = DEFAULT_LANGUAGE, experiences, onOpenChange, aiTranslated, imageReset }: IProps) {
  const translating = language !== DEFAULT_LANGUAGE
  const experiencesFieldArray = useFieldArray({
    control: form.control,
    name: "experiences",
  })
  // The field array's own `id` is its key, so the experience's id is read from the form values
  const savedExperience = (index: number) => {
    const id = form.getValues(`experiences.${index}.id`)
    return id ? experiences?.find((e) => e?.id === id) : undefined
  }

  // Experiences are collapsed, so a failed submit opens those with errors and, unless the form already focused an error
  // above them, moves to the first one
  const { submitCount, errors } = form.formState
  const [openKeys, setOpenKeys] = useState<string[]>([])
  const [handledSubmitCount, setHandledSubmitCount] = useState(submitCount)
  const [focusRequest, setFocusRequest] = useState<{ index: number; field?: (typeof focusableFields)[number] } | null>(null)
  if (submitCount !== handledSubmitCount) {
    setHandledSubmitCount(submitCount)
    const erroredIndexes = experiencesFieldArray.fields.map((_, index) => index).filter((index) => errors.experiences?.[index])
    if (erroredIndexes.length) {
      const erroredKeys = erroredIndexes.map((index) => experiencesFieldArray.fields[index].id)
      setOpenKeys((keys) => [...keys.filter((key) => !erroredKeys.includes(key)), ...erroredKeys])
      if (!Object.keys(errors).some((key) => key !== "experiences")) {
        const index = erroredIndexes[0]
        setFocusRequest({ index, field: focusableFields.find((key) => errors.experiences?.[index]?.[key]) })
      }
    }
  }

  useEffect(() => {
    if (!focusRequest) return
    const { index, field } = focusRequest
    if (field) {
      form.setFocus(`experiences.${index}.${field}`)
    } else {
      document.querySelector(`[data-experience="${index}"]`)?.scrollIntoView({ behavior: "smooth", block: "center" })
    }
  }, [focusRequest, form])

  function onExperienceLogoSelected(e: React.ChangeEvent<HTMLInputElement>, index: number) {
    const file = e.target.files?.[0]
    if (file) {
      // Dirty, so switching language asks before discarding the picked logo
      form.setValue(`experiences.${index}.logo_file`, file, { shouldDirty: true })
    }
  }

  return (
    <>
      <div className="flex items-center justify-between">
        <div className="text-xl font-bold">Work Experience</div>
        <Button
          type="button"
          variant="secondary"
          disabled={translating}
          onClick={() =>
            experiencesFieldArray.prepend({
              position: "",
              company: "",
              location: "",
              start_date: new Date(),
              end_date: null,
              description: "",
            })
          }
        >
          <CirclePlus size={18} className="mr-2" />
          Add Experience
        </Button>
      </div>
      {experiencesFieldArray.fields.length === 0 ? (
        <div className="col-span-5 text-center text-slate-400">No Experience</div>
      ) : (
        experiencesFieldArray.fields.map((field, index) => {
          const saved = savedExperience(index)
          const status = translating && saved ? translationStatus(saved.translations, language) : undefined

          return (
            <Collapsible
              key={field.id}
              data-experience={index}
              open={openKeys.includes(field.id)}
              onOpenChange={(open) => {
                setOpenKeys((keys) => (open ? [...keys, field.id] : keys.filter((key) => key !== field.id)))
                if (saved) onOpenChange?.(saved.id, open)
              }}
              className="w-full rounded border border-slate-300"
            >
              <CollapsibleTrigger
                className={cn("flex w-full items-center gap-2 bg-slate-200 px-4 py-2 text-left", {
                  "rounded-t bg-red-400 text-white": errors.experiences?.[index],
                })}
              >
                <ExperienceSummary
                  form={form}
                  index={index}
                  experience={field}
                  // Outside English the position may still be missing: the header reads the English one meanwhile
                  fallbackPosition={translating ? saved?.position : undefined}
                />
                {saved && aiTranslated?.(saved.id) ? (
                  <AiTranslatedBadge />
                ) : (
                  status && status !== "translated" && <TranslationStatusBadge status={status} />
                )}
                <ChevronDown size={18} className="ml-auto" />
              </CollapsibleTrigger>
              <CollapsibleContent className="p-3">
                <div className="my-4 flex gap-4">
                  <FileUpload
                    key={imageReset}
                    className="size-20"
                    imageSrc={
                      form.getValues(`experiences.${index}.logo_key`)
                        ? `/media/${form.getValues(`experiences.${index}.logo_key`)}?w=160&h=160`
                        : undefined
                    }
                    fallback={<Building size={35} />}
                    uploadCta=""
                    onChange={(e) => onExperienceLogoSelected(e, index)}
                    disabled={translating}
                  />
                  <FormField
                    control={form.control}
                    name={`experiences.${index}.company`}
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Company</FormLabel>
                        <FormControl>
                          <Input {...field} disabled={translating} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name={`experiences.${index}.position`}
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Position</FormLabel>
                        <FormControl>
                          <Input {...field} placeholder={untranslatedPlaceholder(language, saved?.position, { required: true })} />
                        </FormControl>
                        <EnglishText language={language} text={saved?.position} />
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name={`experiences.${index}.location`}
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Location</FormLabel>
                        <FormControl>
                          <Input {...field} disabled={translating} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
                <div className="flex gap-4">
                  <FormField
                    control={form.control}
                    name={`experiences.${index}.start_date`}
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Start Date</FormLabel>
                        <FormControl>
                          <MonthYearPicker {...field} showMonth={false} yearRange={[30, 0]} allowEmpty={false} disabled={translating} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name={`experiences.${index}.end_date`}
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>End Date</FormLabel>
                        <FormControl>
                          <MonthYearPicker {...field} showMonth={false} yearRange={[30, 0]} allowEmpty={true} disabled={translating} />
                        </FormControl>
                        <FormMessage />
                        <FormDescription>Leave empty if still ongoing</FormDescription>
                      </FormItem>
                    )}
                  />
                </div>
                <FormField
                  control={form.control}
                  name={`experiences.${index}.description`}
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Description</FormLabel>
                      <FormControl>
                        <AiEditor
                          {...field}
                          className="h-60"
                          prompt={improvePromptIn(improvePrompts.description, language)}
                          placeholder={untranslatedPlaceholder(language, saved?.description)}
                        />
                      </FormControl>
                      <EnglishReference language={language} text={saved?.description} />
                      <FormMessage />
                    </FormItem>
                  )}
                />
                {!translating && (
                  <div className="text-right">
                    <Button type="button" onClick={() => experiencesFieldArray.remove(index)} variant="ghost" className="mt-2">
                      <Trash size={18} className="text-destructive" />
                    </Button>
                  </div>
                )}
              </CollapsibleContent>
            </Collapsible>
          )
        })
      )}
    </>
  )
}
