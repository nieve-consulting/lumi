"use client"

import { useCallback } from "react"
import { useRouter } from "next/navigation"
import { Company } from "@/generated/graphql"
import { DEFAULT_LANGUAGE, type Language } from "@lumi/shared-contracts/language"
import { Globe, Heart, Mail, MapPin, Phone, Sprout, Target, Telescope } from "lucide-react"

import { assertSaved } from "@/lib/utils"
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form"
import { Input } from "@/components/ui/input"
import { LoadingButton, LoadingButtonState } from "@/components/ui/loading-button"
import { useToast } from "@/components/ui/use-toast"
import AiEditor from "@/components/MdEditor/AiEditor"
import AiTranslateButton from "@/app/admin/components/translations/AiTranslateButton"
import EnglishFirstNote from "@/app/admin/components/translations/EnglishFirstNote"
import EnglishReference from "@/app/admin/components/translations/EnglishReference"
import {
  assertTranslationSaved,
  contentValues,
  findTranslation,
  improvePromptIn,
  languageLabel,
  untranslatedAsNull,
  untranslatedPlaceholder,
  type FieldDescription,
} from "@/app/admin/components/translations/languages"
import LanguageSwitcher from "@/app/admin/components/translations/LanguageSwitcher"
import TranslationNotice from "@/app/admin/components/translations/TranslationNotice"
import { translatableFields, useAiTranslation } from "@/app/admin/components/translations/useAiTranslation"
import { useTranslatableForm } from "@/app/admin/components/translations/useTranslatableForm"

import { updateCompany } from "../../actions"
import { companyContentFields, companyContentSchema, settingsSchema, type SettingsFormSchema } from "./schema"

const improvePrompts = {
  founding_story: "This text will be used to describe the company's founding story. Use 3rd person",
  values: "This text will be used to describe the company's values. Use first person as if you work for the company",
  mission: "This text will be used to describe the company's mission. Use first person as if you work for the company",
  vision: "This text will be used to describe the company's vision. Use first person as if you work for the company",
}

interface IProps {
  company?: Company
  // Language the form opens in. Only a company saved in English can be translated
  language?: Language
}

// The form's values in a language: the shared fields, plus the company's content in that language. The company is read
// in English, so English takes its own fields
function settingsFormValues(company: Company | undefined, language: Language): SettingsFormSchema {
  const content =
    language === DEFAULT_LANGUAGE
      ? {
          founding_story: company?.founding_story || "",
          values: company?.values || "",
          mission: company?.mission || "",
          vision: company?.vision || "",
        }
      : contentValues(findTranslation(company?.translations, language), companyContentFields)

  return {
    ...content,
    location: company?.location || "",
    phone: company?.phone || "",
    email: company?.email || "",
    webpage: company?.webpage || "",
  }
}

// The company's content fields, as the AI translation describes them
const companyFieldDescriptions = {
  founding_story: { label: "Founding story", markdown: true },
  values: { label: "Values", markdown: true },
  mission: { label: "Mission", markdown: true },
  vision: { label: "Vision", markdown: true },
} satisfies Record<(typeof companyContentFields)[number], FieldDescription>

export default function SettingsForm({ company, language: requestedLanguage = DEFAULT_LANGUAGE }: IProps) {
  const { toast } = useToast()
  const router = useRouter()

  // Translations are written from English, so the company is first saved in English
  const translatable = findTranslation(company?.translations, DEFAULT_LANGUAGE) !== undefined
  const initialLanguage = translatable ? requestedLanguage : DEFAULT_LANGUAGE

  const valuesFor = useCallback((language: Language) => settingsFormValues(company, language), [company])
  const { form, contentLanguage, language, translating } = useTranslatableForm({
    schema: settingsSchema,
    contentSchema: companyContentSchema,
    initialLanguage,
    valuesFor,
  })
  const aiTranslation = useAiTranslation({
    form,
    language,
    record: "company information",
    translations: company?.translations,
    fieldsIn: (from) => translatableFields<SettingsFormSchema>(valuesFor(from), companyFieldDescriptions),
  })

  async function onSubmit(data: SettingsFormSchema) {
    try {
      if (translating) {
        // Saves the content in the language being edited, and only that language. Shared fields are sent as the API
        // requires them, which it ignores
        assertTranslationSaved(await updateCompany(untranslatedAsNull(data, companyContentFields, language), language), language)
        toast({
          title: "Success",
          description: `${languageLabel(language)} translation of the company settings saved`,
        })
      } else {
        assertSaved(await updateCompany(data), "The company settings couldn't be updated. Check the fields and try again.")
        toast({
          title: "Success",
          description: "Company settings updated",
        })
      }
      router.replace("/admin")
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
        {company && translatable ? (
          <div className="space-y-3">
            <LanguageSwitcher control={contentLanguage} translations={company.translations}>
              <AiTranslateButton control={aiTranslation} />
            </LanguageSwitcher>
            <TranslationNotice language={language} translations={company.translations} required={[]} />
          </div>
        ) : (
          <EnglishFirstNote />
        )}
        <div className="flex justify-between gap-2">
          <FormField
            control={form.control}
            name="location"
            render={({ field }) => (
              <FormItem className="w-full">
                <FormLabel className="flex items-center gap-1.5">
                  <MapPin size={14} aria-hidden className="text-blue-700" />
                  Location
                </FormLabel>
                <FormControl>
                  <Input {...field} disabled={translating} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="phone"
            render={({ field }) => (
              <FormItem className="w-full">
                <FormLabel className="flex items-center gap-1.5">
                  <Phone size={14} aria-hidden className="text-blue-700" />
                  Phone
                </FormLabel>
                <FormControl>
                  <Input {...field} disabled={translating} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="email"
            render={({ field }) => (
              <FormItem className="w-full">
                <FormLabel className="flex items-center gap-1.5">
                  <Mail size={14} aria-hidden className="text-blue-700" />
                  Email
                </FormLabel>
                <FormControl>
                  <Input {...field} disabled={translating} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="webpage"
            render={({ field }) => (
              <FormItem className="w-full">
                <FormLabel className="flex items-center gap-1.5">
                  <Globe size={14} aria-hidden className="text-blue-700" />
                  Website
                </FormLabel>
                <FormControl>
                  <Input {...field} disabled={translating} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>
        <FormField
          control={form.control}
          name="founding_story"
          render={({ field }) => (
            <FormItem>
              <FormLabel className="flex items-center gap-1.5">
                <Sprout size={14} aria-hidden className="text-blue-700" />
                Founding Story
              </FormLabel>
              <FormControl>
                <AiEditor
                  {...field}
                  className="h-60"
                  prompt={improvePromptIn(improvePrompts.founding_story, language)}
                  placeholder={untranslatedPlaceholder(language, company?.founding_story)}
                />
              </FormControl>
              <EnglishReference language={language} text={company?.founding_story} />
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="values"
          render={({ field }) => (
            <FormItem>
              <FormLabel className="flex items-center gap-1.5">
                <Heart size={14} aria-hidden className="text-blue-700" />
                Company Values
              </FormLabel>
              <FormControl>
                <AiEditor
                  {...field}
                  className="h-60"
                  prompt={improvePromptIn(improvePrompts.values, language)}
                  placeholder={untranslatedPlaceholder(language, company?.values)}
                />
              </FormControl>
              <EnglishReference language={language} text={company?.values} />
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="mission"
          render={({ field }) => (
            <FormItem>
              <FormLabel className="flex items-center gap-1.5">
                <Target size={14} aria-hidden className="text-blue-700" />
                Company Mission
              </FormLabel>
              <FormControl>
                <AiEditor
                  {...field}
                  className="h-60"
                  prompt={improvePromptIn(improvePrompts.mission, language)}
                  placeholder={untranslatedPlaceholder(language, company?.mission)}
                />
              </FormControl>
              <EnglishReference language={language} text={company?.mission} />
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="vision"
          render={({ field }) => (
            <FormItem>
              <FormLabel className="flex items-center gap-1.5">
                <Telescope size={14} aria-hidden className="text-blue-700" />
                Company Vision
              </FormLabel>
              <FormControl>
                <AiEditor
                  {...field}
                  className="h-60"
                  prompt={improvePromptIn(improvePrompts.vision, language)}
                  placeholder={untranslatedPlaceholder(language, company?.vision)}
                />
              </FormControl>
              <EnglishReference language={language} text={company?.vision} />
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
            text={translating ? `Save ${languageLabel(language)} translation` : "Update"}
            loadingText={translating ? "Saving..." : "Updating..."}
          />
        </div>
      </form>
    </Form>
  )
}
