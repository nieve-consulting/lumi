"use client"

import { useCallback, useState } from "react"
import { useRouter } from "next/navigation"
import { Client } from "@/generated/graphql"
import { inSentence } from "@lumi/shared-contracts/knowledge"
import { DEFAULT_LANGUAGE, type Language } from "@lumi/shared-contracts/language"
import { Building } from "lucide-react"

import { assertSaved } from "@/lib/utils"
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form"
import { Input } from "@/components/ui/input"
import { LoadingButton, LoadingButtonState } from "@/components/ui/loading-button"
import { Switch } from "@/components/ui/switch"
import { useToast } from "@/components/ui/use-toast"
import FileUpload from "@/components/FileUpload"
import AiEditor from "@/components/MdEditor/AiEditor"
import { useSourceLabels } from "@/app/admin/components/SourceLabelsProvider"
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
} from "@/app/admin/components/translations/languages"
import LanguageSwitcher from "@/app/admin/components/translations/LanguageSwitcher"
import TranslationNotice from "@/app/admin/components/translations/TranslationNotice"
import { translatableFields, useAiTranslation } from "@/app/admin/components/translations/useAiTranslation"
import { useTranslatableForm } from "@/app/admin/components/translations/useTranslatableForm"
import { assertImageUploads, MediaStorageNotConfiguredError, settleAfterCreate, uploadImage } from "@/app/admin/uploads"

import { createClient, linkUploadToClientLogo, updateClient } from "../../actions"
import {
  clientContentFields,
  clientContentSchema,
  clientFieldDescriptions,
  clientOptionalContentFields,
  clientRecordKind,
  clientSchema,
  type ClientFormSchema,
} from "./schema"

const improvePrompts = {
  summary: "This text will be used to provide a short summary for one of our company's clients. Refer to them in 3rd person",
  description:
    "This text will be used to describe a client that we have work with more extensively. The goal is to genereate trust with a potentail future client.  Refer to them in 3rd person",
}

async function addLogoToClient(clientId: string, file: File) {
  return linkUploadToClientLogo(await uploadImage(file, "client logo"), clientId)
}

interface IProps {
  client?: Client
  // Language the form opens in. New clients are created in English
  language?: Language
}

// The form's values in a language: the shared fields, plus the client's content in that language. The client is read in
// English, so English takes its own fields
function clientFormValues(client: Client | undefined, language: Language): ClientFormSchema {
  const content =
    language === DEFAULT_LANGUAGE
      ? { summary: client?.summary || "", description: client?.description || "" }
      : contentValues(findTranslation(client?.translations, language), clientContentFields)

  return {
    ...content,
    name: client?.name || "",
    url_slug: client?.url_slug || "",
    internal_webpage: client?.internal_webpage || "",
    client_website: client?.client_website || "",
    published: client?.published ?? false,
  }
}

export default function ClientForm({ client, language: initialLanguage = DEFAULT_LANGUAGE }: IProps) {
  const { toast } = useToast()
  const router = useRouter()
  const label = useSourceLabels().clients.singular

  const startLanguage = client ? initialLanguage : DEFAULT_LANGUAGE
  const valuesFor = useCallback((language: Language) => clientFormValues(client, language), [client])
  const { form, contentLanguage, language, translating } = useTranslatableForm({
    schema: clientSchema,
    contentSchema: clientContentSchema,
    initialLanguage: startLanguage,
    valuesFor,
  })
  // Remounts the logo picker when a picked logo is removed, so its preview goes too
  const [logoReset, setLogoReset] = useState(0)
  const aiTranslation = useAiTranslation({
    form,
    language,
    record: clientRecordKind,
    translations: client?.translations,
    fieldsIn: (from) => translatableFields<ClientFormSchema>(valuesFor(from), clientFieldDescriptions),
  })

  async function onSubmit(data: ClientFormSchema) {
    try {
      if (client && translating) {
        // Saves the content in the language being edited, and only that language. Shared fields are sent as the API
        // requires them, which it ignores
        const input = untranslatedAsNull({ ...data, logo: undefined }, clientOptionalContentFields, language)
        assertTranslationSaved(await updateClient(client.id, input, language), language)
        toast({ title: `${languageLabel(language)} translation of ${client.name} saved` })
      } else if (client) {
        await assertImageUploads([data.logo])
        const updatePromises = [updateClient(client.id, { ...data, logo: undefined })]
        if (data.logo) {
          updatePromises.push(addLogoToClient(client.id, data.logo))
        }

        assertSaved(await Promise.all(updatePromises), `${client.name} couldn't be updated. Check the fields and try again.`)
        toast({
          title: `${data.name} has been updated`,
        })
      } else {
        await assertImageUploads([data.logo])
        const clientId = await createClient({ ...data, logo: undefined })

        if (clientId) {
          const logoSaved = await settleAfterCreate(data.logo ? [addLogoToClient(clientId, data.logo)] : [])
          toast(
            logoSaved
              ? { title: `${data.name} has been created` }
              : {
                  variant: "destructive",
                  title: `${data.name} has been created`,
                  description: "Its logo couldn't be uploaded. Open it from the list to add the logo again.",
                }
          )
        } else {
          throw new Error(`Error creating ${inSentence(label)}`)
        }
      }

      router.replace("/admin/clients")
    } catch (e) {
      const err = e as Error
      if (err instanceof MediaStorageNotConfiguredError) {
        form.setValue("logo", undefined)
        setLogoReset((count) => count + 1)
      }
      toast({
        variant: "destructive",
        title: "Error",
        description: err.message,
      })
    }
  }

  function onLogoFileSelected(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (file) {
      // Dirty, so switching language asks before discarding the picked logo
      form.setValue("logo", file, { shouldDirty: true })
    }
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8">
        {client ? (
          <div className="space-y-3">
            <LanguageSwitcher control={contentLanguage} translations={client.translations}>
              <AiTranslateButton control={aiTranslation} />
            </LanguageSwitcher>
            <TranslationNotice language={language} translations={client.translations} required={["Summary"]} />
          </div>
        ) : (
          <EnglishFirstNote />
        )}
        <div className="flex gap-0">
          {/* Remounted per language and when the picked logo is removed, so its preview goes with it */}
          <FileUpload
            key={`${language}-${logoReset}`}
            className="size-20"
            imageSrc={client && client.logo_key ? `/media/${client.logo_key}?w=160&h=160` : undefined}
            fallback={<Building size={30} />}
            uploadCta=""
            onChange={onLogoFileSelected}
            disabled={translating}
          />
          <div className="grow">
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Name</FormLabel>
                  <FormControl>
                    <Input {...field} disabled={translating} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <div className="flex gap-2">
              <FormField
                control={form.control}
                name="url_slug"
                render={({ field }) => (
                  <FormItem className="flex-1">
                    <FormLabel>Url Slug</FormLabel>
                    <FormControl>
                      <Input {...field} disabled={translating} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="internal_webpage"
                render={({ field }) => (
                  <FormItem className="flex-1">
                    <FormLabel>Internal Webpage</FormLabel>
                    <FormControl>
                      <Input {...field} disabled={translating} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="client_website"
                render={({ field }) => (
                  <FormItem className="flex-1">
                    <FormLabel>Website</FormLabel>
                    <FormControl>
                      <Input {...field} disabled={translating} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
          </div>
        </div>
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
              <FormDescription>Show this record in the public chatbot and to anonymous ChatGPT users.</FormDescription>
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
                <AiEditor
                  {...field}
                  className="h-60"
                  prompt={improvePromptIn(improvePrompts.summary, language)}
                  placeholder={untranslatedPlaceholder(language, client?.summary, { required: true })}
                />
              </FormControl>
              <FormDescription>A short intro of the {inSentence(label)}</FormDescription>
              <EnglishReference language={language} text={client?.summary} />
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
                  className="h-60"
                  prompt={improvePromptIn(improvePrompts.description, language)}
                  placeholder={untranslatedPlaceholder(language, client?.description)}
                />
              </FormControl>
              <EnglishReference language={language} text={client?.description} />
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
            text={translating ? `Save ${languageLabel(language)} translation` : `${client ? "Update" : "Create"} ${inSentence(label)}`}
            loadingText={translating ? "Saving..." : `${client ? "Updating" : "Creating"}...`}
          />
        </div>
      </form>
    </Form>
  )
}
