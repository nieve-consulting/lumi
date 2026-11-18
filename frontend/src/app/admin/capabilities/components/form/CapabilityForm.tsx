"use client"

import { forwardRef } from "react"
import { Capability } from "@/generated/graphql"
import type { Language } from "@lumi/shared-contracts/language"
import type { UseFormReturn } from "react-hook-form"

import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form"
import { Input } from "@/components/ui/input"
import AiEditor from "@/components/MdEditor/AiEditor"
import EnglishReference from "@/app/admin/components/translations/EnglishReference"
import EnglishText from "@/app/admin/components/translations/EnglishText"
import { improvePromptIn, untranslatedPlaceholder } from "@/app/admin/components/translations/languages"

import { type CapabilityFormSchema } from "./schema"

const improvePrompts = {
  description:
    "This text will be used to describe a capability that team members have. Describe only the capability in the abstract, not the team members.",
}

interface IProps {
  // Created by the modal, which also switches the language it edits
  form: UseFormReturn<CapabilityFormSchema>
  // Language being edited
  language: Language
  // The capability in English, to show its text while editing another language
  capability?: Capability
  onSubmit: (data: CapabilityFormSchema) => Promise<void>
}

const CapabilityForm = forwardRef<HTMLFormElement, IProps>(({ form, language, capability, onSubmit }, ref) => {
  return (
    <Form {...form}>
      <form ref={ref} onSubmit={form.handleSubmit(onSubmit)} className="space-y-8">
        <FormField
          control={form.control}
          name="name"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Name</FormLabel>
              <FormControl>
                <Input {...field} placeholder={untranslatedPlaceholder(language, capability?.name, { required: true })} />
              </FormControl>
              <EnglishText language={language} text={capability?.name} />
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
                  prompt={improvePromptIn(
                    `${improvePrompts.description} The capability is ${form.getValues("name") || capability?.name || ""}`,
                    language
                  )}
                  placeholder={untranslatedPlaceholder(language, capability?.description)}
                />
              </FormControl>
              <EnglishReference language={language} text={capability?.description} />
              <FormMessage />
            </FormItem>
          )}
        />
      </form>
    </Form>
  )
})

CapabilityForm.displayName = "CapabilityForm"

export default CapabilityForm
