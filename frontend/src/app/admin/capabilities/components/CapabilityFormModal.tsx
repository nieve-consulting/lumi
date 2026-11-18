import { useCallback, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import type { Capability } from "@/generated/graphql"
import { inSentence } from "@lumi/shared-contracts/knowledge"
import { DEFAULT_LANGUAGE, type Language } from "@lumi/shared-contracts/language"

import { assertSaved } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { LoadingButton, LoadingButtonState } from "@/components/ui/loading-button"
import { useToast } from "@/components/ui/use-toast"
import { useSourceLabels } from "@/app/admin/components/SourceLabelsProvider"
import AiTranslateButton from "@/app/admin/components/translations/AiTranslateButton"
import EnglishFirstNote from "@/app/admin/components/translations/EnglishFirstNote"
import {
  assertTranslationSaved,
  contentValues,
  findTranslation,
  languageLabel,
  untranslatedAsNull,
} from "@/app/admin/components/translations/languages"
import LanguageSwitcher from "@/app/admin/components/translations/LanguageSwitcher"
import TranslationNotice from "@/app/admin/components/translations/TranslationNotice"
import { translatableFields, useAiTranslation } from "@/app/admin/components/translations/useAiTranslation"
import { useTranslatableForm } from "@/app/admin/components/translations/useTranslatableForm"

import { createCapability, updateCapability } from "../actions"
import { useCapabilityStore } from "../storeProvider"
import CapabilityForm from "./form/CapabilityForm"
import {
  capabilityContentFields,
  capabilityFieldDescriptions,
  capabilityOptionalContentFields,
  capabilityRecordKind,
  capabilitySchema,
  type CapabilityFormSchema,
} from "./form/schema"

// The form's values in a language. The capability is read in English, so English takes its own fields
function capabilityFormValues(capability: Capability | undefined, language: Language): CapabilityFormSchema {
  if (language === DEFAULT_LANGUAGE) {
    return { name: capability?.name || "", description: capability?.description || "" }
  }
  return contentValues(findTranslation(capability?.translations, language), capabilityContentFields)
}

interface IFormContentProps {
  // The capability to edit, or none to create one
  capability?: Capability
  // Language the form opens in. New capabilities are created in English
  initialLanguage: Language
  onClose: () => void
}

// The modal's form, created when the modal opens so it starts from the capability's values in the language
function CapabilityFormContent({ capability, initialLanguage, onClose }: IFormContentProps) {
  const formRef = useRef<HTMLFormElement>(null)
  const [loading, setLoading] = useState<LoadingButtonState>(LoadingButtonState.Idle)
  const { toast } = useToast()
  const router = useRouter()
  const singular = inSentence(useSourceLabels().capabilities.singular)

  const valuesFor = useCallback((language: Language) => capabilityFormValues(capability, language), [capability])
  // Every field of a capability is content, so every language checks them all. The modal is not a page of its own, so the
  // language stays out of the URL
  const { form, contentLanguage, language, translating } = useTranslatableForm({
    schema: capabilitySchema,
    contentSchema: capabilitySchema,
    initialLanguage,
    valuesFor,
    syncUrl: false,
  })
  const aiTranslation = useAiTranslation({
    form,
    language,
    record: capabilityRecordKind,
    translations: capability?.translations,
    fieldsIn: (from) => translatableFields<CapabilityFormSchema>(valuesFor(from), capabilityFieldDescriptions),
  })

  async function onSubmit(data: CapabilityFormSchema) {
    try {
      setLoading(LoadingButtonState.Loading)
      if (capability && translating) {
        // Saves the content in the language being edited, and only that language
        assertTranslationSaved(
          await updateCapability(capability.id, untranslatedAsNull(data, capabilityOptionalContentFields, language), language),
          language
        )

        toast({
          title: `${languageLabel(language)} translation of ${capability.name} saved`,
        })
      } else if (capability) {
        assertSaved(await updateCapability(capability.id, data), `${capability.name} couldn't be updated. Check the fields and try again.`)

        toast({
          title: `${data.name} has been updated`,
        })
      } else {
        const capabilityId = await createCapability(data)

        if (capabilityId) {
          toast({
            title: `${data.name} has been created`,
          })
        } else {
          throw new Error(`Error creating ${singular}`)
        }
      }

      router.replace("/admin/capabilities")
      onClose()
    } catch (e) {
      // The form stays open with the user's changes, to fix them and save again
      const err = e as Error
      toast({
        variant: "destructive",
        title: "Error",
        description: err.message,
      })
    } finally {
      setLoading(LoadingButtonState.Idle)
    }
  }

  return (
    <>
      <DialogHeader>
        <DialogTitle>{capability ? capability.name : `New ${singular}`}</DialogTitle>
        <DialogDescription>
          {translating
            ? `Translate the ${singular}'s name and description into ${languageLabel(language)}.`
            : capability
              ? `Edit the ${singular}'s name and description.`
              : `Enter the new ${singular}'s name and description.`}
        </DialogDescription>
      </DialogHeader>
      <div className="space-y-6">
        {capability ? (
          <div className="space-y-3">
            <LanguageSwitcher control={contentLanguage} translations={capability.translations}>
              <AiTranslateButton control={aiTranslation} />
            </LanguageSwitcher>
            <TranslationNotice
              language={language}
              translations={capability.translations}
              required={["Name"]}
              sharedNote={`Saving here changes only the ${languageLabel(language)} text; English stays as it is.`}
            />
          </div>
        ) : (
          <EnglishFirstNote />
        )}
        <CapabilityForm ref={formRef} form={form} language={language} capability={capability} onSubmit={onSubmit} />
      </div>
      <DialogFooter>
        <DialogClose asChild>
          <Button type="button" variant="secondary">
            Cancel
          </Button>
        </DialogClose>
        <LoadingButton
          state={loading}
          // Saving while the AI translation runs would save the text from before it and drop the translation
          disabled={aiTranslation.pending !== null}
          text={translating ? `Save ${languageLabel(language)} translation` : capability ? "Update" : "Create"}
          loadingText={translating ? "Saving..." : capability ? "Updating..." : "Creating..."}
          onClick={() => formRef.current?.dispatchEvent(new Event("submit", { cancelable: true, bubbles: true }))}
        />
      </DialogFooter>
    </>
  )
}

export default function CapabilityFormModal() {
  const { itemForForm, languageForForm, setItemForForm } = useCapabilityStore((state) => state)
  // Keeps showing the last capability while the modal animates closed
  const [shown, setShown] = useState({ item: itemForForm, language: languageForForm })
  if (itemForForm && (itemForForm !== shown.item || languageForForm !== shown.language)) {
    setShown({ item: itemForForm, language: languageForForm })
  }

  const isOpen = itemForForm != null
  const capability = shown.item && shown.item !== "new" ? shown.item : undefined

  function closeModal() {
    setItemForForm(null)
  }

  function handleOpenChange(open: boolean) {
    if (!open) closeModal()
  }

  return (
    <Dialog open={isOpen} onOpenChange={handleOpenChange}>
      <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto">
        {shown.item && (
          <CapabilityFormContent
            key={`${capability?.id ?? "new"}-${shown.language}`}
            capability={capability}
            initialLanguage={capability ? shown.language : DEFAULT_LANGUAGE}
            onClose={closeModal}
          />
        )}
      </DialogContent>
    </Dialog>
  )
}
