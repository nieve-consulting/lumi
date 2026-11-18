"use client"

import { useCallback, useState } from "react"
import { useRouter } from "next/navigation"
import type { Capability, ExperienceInput, TeamMember, TeamMemberCapabilityInput } from "@/generated/graphql"
import { inSentence } from "@lumi/shared-contracts/knowledge"
import { DEFAULT_LANGUAGE, type Language } from "@lumi/shared-contracts/language"
import { User } from "lucide-react"

import { assertSaved } from "@/lib/utils"
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form"
import { Input } from "@/components/ui/input"
import { LoadingButton, LoadingButtonState } from "@/components/ui/loading-button"
import { Switch } from "@/components/ui/switch"
import { useToast } from "@/components/ui/use-toast"
import FileUpload from "@/components/FileUpload"
import AiEditor from "@/components/MdEditor/AiEditor"
import { useShowsSource, useSourceLabels } from "@/app/admin/components/SourceLabelsProvider"
import AiTranslateButton from "@/app/admin/components/translations/AiTranslateButton"
import EnglishFirstNote from "@/app/admin/components/translations/EnglishFirstNote"
import EnglishReference from "@/app/admin/components/translations/EnglishReference"
import EnglishText from "@/app/admin/components/translations/EnglishText"
import {
  assertTranslationSaved,
  contentValues,
  findTranslation,
  improvePromptIn,
  isUnreviewed,
  languageLabel,
  nestedNeedingReview,
  recordTranslationStatus,
  unreviewedNote,
  untranslatedAsNull,
  untranslatedPlaceholder,
  type Unreviewed,
} from "@/app/admin/components/translations/languages"
import LanguageSwitcher from "@/app/admin/components/translations/LanguageSwitcher"
import TranslationNotice from "@/app/admin/components/translations/TranslationNotice"
import { translatableFields, useAiTranslation, type TranslatableField } from "@/app/admin/components/translations/useAiTranslation"
import { useNestedReview } from "@/app/admin/components/translations/useNestedReview"
import { useTranslatableForm } from "@/app/admin/components/translations/useTranslatableForm"
import { assertImageUploads, MediaStorageNotConfiguredError, settleAfterCreate, uploadImage } from "@/app/admin/uploads"

import {
  addCapabilitiesToTeamMember,
  addExperiencesToTeamMember,
  createTeamMember,
  linkUploadToExperienceLogo,
  linkUploadToTeamMemberPhoto,
  removeCapabilitiesFromTeamMember,
  removeExperiencesFromTeamMember,
  updateTeamMember,
  updateTeamMemberCapabilities,
  updateTeamMemberExperiences,
} from "../../actions"
import Capabilities from "./Capabilities"
import Experiences from "./Experiences"
import {
  experienceContentFields,
  experienceFieldDescriptions,
  experienceOptionalContentFields,
  teamMemberContentFields,
  teamMemberContentSchema,
  teamMemberFieldDescriptions,
  teamMemberOptionalContentFields,
  teamMemberRecordKind,
  teamMemberSchema,
  type TeamMemberFormSchema,
} from "./schema"

const improvePrompts = {
  bio: "This text will be used as a team member's bio",
  education: "This text will be used to describe a team member's education",
  capability_highlights: "This text will be used to highlight a team member's capabilities",
}

async function addPhotoToTeamMember(teamMemberId: string, file: File) {
  return linkUploadToTeamMemberPhoto(await uploadImage(file, "profile photo"), teamMemberId)
}

async function addLogoToExperience(teamMemberId: string, experienceId: string, file: File) {
  return linkUploadToExperienceLogo(await uploadImage(file, "experience logo"), experienceId, teamMemberId)
}

async function addExperiences(teamMemberId: string, experiences: TeamMemberFormSchema["experiences"]) {
  if (!experiences) {
    return
  }

  const promises: Promise<unknown>[] = []

  const ids = await addExperiencesToTeamMember(
    teamMemberId,
    experiences.map((e) => ({
      ...e,
      start_date: e.start_date.toISOString(),
      end_date: e.end_date?.toISOString(),
      logo_file: undefined,
      logo_key: undefined,
    }))
  )

  if (ids && ids.length > 0) {
    experiences.forEach((e, index) => {
      if (e.logo_file) {
        if (e.logo_file instanceof File) {
          promises.push(addLogoToExperience(teamMemberId, ids[index]!, e.logo_file))
        }
      }
    })
  }

  return Promise.all(promises)
}

async function updateExperiences(teamMemberId: string, experiences: TeamMemberFormSchema["experiences"]) {
  if (!experiences) {
    return
  }

  const promises: Promise<unknown>[] = [
    updateTeamMemberExperiences(
      teamMemberId,
      experiences.map((e) => ({
        ...e,
        start_date: e.start_date.toISOString(),
        end_date: e.end_date?.toISOString(),
        logo_file: undefined,
        logo_key: undefined,
      }))
    ),
  ]
  experiences.forEach((e) => {
    if (e.logo_file) {
      if (e.logo_file instanceof File) {
        promises.push(addLogoToExperience(teamMemberId, e.id!, e.logo_file))
      }
    }
  })

  return Promise.all(promises)
}

interface IProps {
  teamMember?: TeamMember
  // Language the form opens in. New team members are created in English
  language?: Language
  capabilities: Capability[]
}

// The form's values in a language: the shared fields, plus the team member's and its experiences' content in that language.
// The team member is read in English, so English takes its own fields
function teamMemberFormValues(teamMember: TeamMember | undefined, language: Language): TeamMemberFormSchema {
  const english = language === DEFAULT_LANGUAGE
  const content = english
    ? {
        job_title: teamMember?.job_title || "",
        bio: teamMember?.bio || "",
        education: teamMember?.education || "",
        capability_highlights: teamMember?.capability_highlights || "",
      }
    : contentValues(findTranslation(teamMember?.translations, language), teamMemberContentFields)

  return {
    ...content,
    name: teamMember?.name || "",
    published: teamMember?.published ?? false,
    url_slug: teamMember?.url_slug || "",
    webpage: teamMember?.webpage || "",
    experiences:
      teamMember?.experiences?.map((e) => {
        if (e) {
          const experienceContent = english
            ? { position: e.position, description: e.description || undefined }
            : contentValues(findTranslation(e.translations, language), experienceContentFields)

          return {
            ...experienceContent,
            id: e.id,
            company: e.company,
            location: e.location,
            start_date: e.start_date ? new Date(e.start_date) : new Date(),
            end_date: e.end_date ? new Date(e.end_date) : null,
            logo_key: e.logo_key || undefined,
          }
        }

        throw new Error("Experience is undefined")
      }) || [],
    capabilities:
      teamMember?.capabilities?.map((s) => {
        if (s) {
          return {
            ...s,
            capabilityId: s.id,
          }
        }
        throw new Error("Capability is undefined")
      }) || [],
  }
}

// The team member's and its experiences' content fields the AI translation fills, from the form's values in a language
function teamMemberTranslatableFields(values: TeamMemberFormSchema): TranslatableField<TeamMemberFormSchema>[] {
  return [
    ...translatableFields<TeamMemberFormSchema>(values, teamMemberFieldDescriptions),
    ...(values.experiences ?? []).flatMap((experience, index) =>
      translatableFields<TeamMemberFormSchema>(experience, experienceFieldDescriptions(experience.company), {
        path: `experiences.${index}`,
        item: experience.id,
      })
    ),
  ]
}

export default function TeamMemberForm({ teamMember, language: initialLanguage = DEFAULT_LANGUAGE, capabilities }: IProps) {
  const { toast } = useToast()
  const router = useRouter()
  const labels = useSourceLabels()
  const showsCapabilities = useShowsSource("capabilities")

  const startLanguage = teamMember ? initialLanguage : DEFAULT_LANGUAGE
  const valuesFor = useCallback((language: Language) => teamMemberFormValues(teamMember, language), [teamMember])
  const { form, contentLanguage, language, translating } = useTranslatableForm({
    schema: teamMemberSchema,
    contentSchema: teamMemberContentSchema,
    initialLanguage: startLanguage,
    valuesFor,
  })
  // Experiences opened for review: an outdated one, an AI draft, or one the AI translation filled, is saved only once
  // reviewed
  const experienceReview = useNestedReview(language)
  // Remounts the image pickers when picked images are removed, so their previews go too
  const [imageReset, setImageReset] = useState(0)
  const aiTranslation = useAiTranslation({
    form,
    language,
    record: teamMemberRecordKind,
    translations: teamMember?.translations,
    fieldsIn: (from) => teamMemberTranslatableFields(valuesFor(from)),
    items: { singular: "experience", plural: "experiences" },
    review: experienceReview,
  })
  // Experiences missing, drafts or outdated in a language: the team member needs reviewing there too. Every experience has
  // an English position, so all of them count
  const experiencesNeedingReview = (language: Language) => nestedNeedingReview(teamMember?.experiences, language)

  function onProfilePhotoSelected(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (file) {
      // Dirty, so switching language asks before discarding the picked photo
      form.setValue("profile_photo", file, { shouldDirty: true })
    }
  }

  // Saves the content in the language being edited, and only that language. Shared fields are edited in English: they
  // are sent as the API requires them, which it ignores, and experiences, capabilities and images are neither added nor removed
  // Returns how many experiences were left out as unreviewed
  async function saveTranslation(teamMember: TeamMember, data: TeamMemberFormSchema) {
    const input = untranslatedAsNull(
      { ...data, experiences: undefined, capabilities: undefined, profile_photo: undefined },
      teamMemberOptionalContentFields,
      language
    )
    const promises: Promise<unknown>[] = [updateTeamMember(teamMember.id, input, language)]

    const unreviewed: Unreviewed = { unopened: 0, aiTranslated: 0 }
    const experiences: ExperienceInput[] = (data.experiences ?? []).flatMap((e) => {
      if (!e.id) return []
      const { description } = untranslatedAsNull(e, experienceOptionalContentFields, language)
      const saved = findTranslation(teamMember.experiences?.find((experience) => experience?.id === e.id)?.translations, language)
      if (experienceReview.isAiTranslated(e.id)) {
        unreviewed.aiTranslated++
        return []
      }
      if (isUnreviewed(saved, { position: e.position, description }, experienceReview.isOpened(e.id))) {
        unreviewed.unopened++
        return []
      }

      return [
        {
          id: e.id,
          company: e.company,
          location: e.location,
          position: e.position,
          description,
          start_date: e.start_date.toISOString(),
          end_date: e.end_date ? e.end_date.toISOString() : null,
        },
      ]
    })
    if (experiences.length) {
      promises.push(updateTeamMemberExperiences(teamMember.id, experiences, language))
    }

    assertTranslationSaved(await Promise.all(promises), language)
    return unreviewed
  }

  async function onSubmit(data: TeamMemberFormSchema) {
    try {
      if (teamMember && translating) {
        const unreviewed = await saveTranslation(teamMember, data)
        toast({
          title: `${languageLabel(language)} translation of ${teamMember.name} saved`,
          description: unreviewedNote(unreviewed, { singular: "experience", plural: "experiences" }, language),
        })
      } else if (teamMember) {
        await assertImageUploads([data.profile_photo, ...(data.experiences ?? []).map((e) => e.logo_file)])
        const updatePromises: Promise<unknown>[] = [
          updateTeamMember(teamMember.id, { ...data, experiences: undefined, capabilities: undefined, profile_photo: undefined }),
        ]

        if (data.profile_photo) {
          updatePromises.push(addPhotoToTeamMember(teamMember.id, data.profile_photo))
        }

        if (data.experiences) {
          const newExperiences: TeamMemberFormSchema["experiences"] = []
          const updatedExperiences: TeamMemberFormSchema["experiences"] = []
          const deletedExperienceIds: string[] = []

          data.experiences.forEach((e) => {
            if (e.id) {
              const original = teamMember.experiences?.find((ex) => ex?.id == e.id)
              if (
                e.logo_file ||
                (original && Object.keys(e).some((key) => key in original && original[key as keyof typeof original] != e[key as keyof typeof e]))
              ) {
                updatedExperiences.push(e)
              }
            } else {
              newExperiences.push(e)
            }
          })

          teamMember.experiences?.forEach((e) => {
            if (e) {
              if (!data.experiences!.find((d) => d.id === e.id)) {
                deletedExperienceIds.push(e.id)
              }
            }
          })

          if (newExperiences.length) {
            updatePromises.push(addExperiences(teamMember.id, newExperiences))
          }

          if (updatedExperiences.length) {
            updatePromises.push(updateExperiences(teamMember.id, updatedExperiences))
          }

          if (deletedExperienceIds.length) {
            updatePromises.push(removeExperiencesFromTeamMember(teamMember.id, deletedExperienceIds))
          }
        }

        if (data.capabilities) {
          const newCapabilities: TeamMemberCapabilityInput[] = []
          const updatedCapabilities: TeamMemberCapabilityInput[] = []
          const deletedCapabilityIds: string[] = []

          data.capabilities.forEach((s) => {
            const original = teamMember.capabilities?.find((sk) => sk?.id == s.capabilityId)
            if (original) {
              if (Object.keys(s).some((key) => key in original && original[key as keyof typeof original] != s[key as keyof typeof s])) {
                updatedCapabilities.push({ id: s.capabilityId, stars: s.stars })
              }
            } else {
              newCapabilities.push({ id: s.capabilityId, stars: s.stars })
            }
          })

          teamMember.capabilities?.forEach((s) => {
            if (s) {
              if (!data.capabilities!.find((d) => d.capabilityId === s.id)) {
                deletedCapabilityIds.push(s.id)
              }
            }
          })

          if (newCapabilities.length) {
            updatePromises.push(addCapabilitiesToTeamMember(teamMember.id, newCapabilities))
          }

          if (updatedCapabilities.length) {
            updatePromises.push(updateTeamMemberCapabilities(teamMember.id, updatedCapabilities))
          }

          if (deletedCapabilityIds.length) {
            updatePromises.push(removeCapabilitiesFromTeamMember(teamMember.id, deletedCapabilityIds))
          }
        }

        assertSaved(await Promise.all(updatePromises), `${teamMember.name} couldn't be updated. Check the fields and try again.`)
        toast({
          title: `${data.name} has been updated`,
        })
      } else {
        await assertImageUploads([data.profile_photo, ...(data.experiences ?? []).map((e) => e.logo_file)])
        const teamMemberId = await createTeamMember({ ...data, experiences: undefined, capabilities: undefined, profile_photo: undefined })

        if (teamMemberId) {
          const addPromises: Promise<unknown>[] = []

          if (data.profile_photo) {
            addPromises.push(addPhotoToTeamMember(teamMemberId, data.profile_photo))
          }

          if (data.experiences && data.experiences.length > 0) {
            addPromises.push(addExperiences(teamMemberId, data.experiences))
          }

          if (data.capabilities && data.capabilities.length > 0) {
            addPromises.push(
              addCapabilitiesToTeamMember(
                teamMemberId,
                data.capabilities.map((s) => ({ id: s.capabilityId, stars: s.stars }))
              )
            )
          }

          const imagesSaved = await settleAfterCreate(addPromises)
          toast(
            imagesSaved
              ? { title: `${data.name} has been created` }
              : {
                  variant: "destructive",
                  title: `${data.name} has been created`,
                  description: "Some of its images couldn't be uploaded. Open it from the list to add them again.",
                }
          )
        } else {
          throw new Error(`Error creating ${inSentence(labels.teamMembers.singular)}`)
        }
      }

      router.replace("/admin/team-members")
    } catch (e) {
      const err = e as Error
      if (err instanceof MediaStorageNotConfiguredError) {
        form.setValue("profile_photo", undefined)
        form.getValues("experiences")?.forEach((_, index) => form.setValue(`experiences.${index}.logo_file`, undefined))
        setImageReset((count) => count + 1)
      }
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
        {teamMember ? (
          <div className="space-y-3">
            <LanguageSwitcher
              control={contentLanguage}
              translations={teamMember.translations}
              getStatus={(option) => recordTranslationStatus(teamMember.translations, option, experiencesNeedingReview(option))}
            >
              <AiTranslateButton control={aiTranslation} />
            </LanguageSwitcher>
            <TranslationNotice
              language={language}
              translations={teamMember.translations}
              required={["Job title", "each experience's position"]}
              nestedReview={{
                ...experiencesNeedingReview(language),
                singular: "experience",
                plural: "experiences",
                aiTranslated: experienceReview.aiTranslatedCount,
              }}
            />
          </div>
        ) : (
          <EnglishFirstNote />
        )}
        <div className="flex gap-2">
          {/* Remounted per language and when the picked photo is removed, so its preview goes with it */}
          <FileUpload
            key={`${language}-${imageReset}`}
            imageSrc={teamMember && teamMember.profile_photo_key ? `/media/${teamMember.profile_photo_key}?w=150&h=150` : undefined}
            fallback={<User size={50} />}
            uploadCta="Upload Photo"
            onChange={onProfilePhotoSelected}
            disabled={translating}
          />
          <div className="grow">
            <div className="flex gap-2">
              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem className="grow">
                    <FormLabel>Name</FormLabel>
                    <FormControl>
                      <Input {...field} disabled={translating} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="job_title"
                render={({ field }) => (
                  <FormItem className="grow">
                    <FormLabel>Job Title</FormLabel>
                    <FormControl>
                      <Input {...field} placeholder={untranslatedPlaceholder(language, teamMember?.job_title, { required: true })} />
                    </FormControl>
                    <EnglishText language={language} text={teamMember?.job_title} />
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
            <div className="mt-3 flex gap-2">
              <FormField
                control={form.control}
                name="url_slug"
                render={({ field }) => (
                  <FormItem className="grow">
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
                name="webpage"
                render={({ field }) => (
                  <FormItem className="grow">
                    <FormLabel>Webpage</FormLabel>
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
              <FormDescription>
                Show this record in the public chatbot and to anonymous ChatGPT users. Unpublish {inSentence(labels.teamMembers.plural)} who leave the
                company.
              </FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="bio"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Bio</FormLabel>
              <FormControl>
                <AiEditor
                  {...field}
                  className="h-60"
                  prompt={improvePromptIn(improvePrompts.bio, language)}
                  placeholder={untranslatedPlaceholder(language, teamMember?.bio)}
                />
              </FormControl>
              <EnglishReference language={language} text={teamMember?.bio} />
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="education"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Education</FormLabel>
              <FormControl>
                <AiEditor
                  {...field}
                  className="h-60"
                  prompt={improvePromptIn(improvePrompts.education, language)}
                  placeholder={untranslatedPlaceholder(language, teamMember?.education)}
                />
              </FormControl>
              <EnglishReference language={language} text={teamMember?.education} />
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="capability_highlights"
          render={({ field }) => (
            <FormItem>
              {/* The team member's own text, named after capabilities only while they're on */}
              <FormLabel>{showsCapabilities ? `${labels.capabilities.singular} highlights` : "Highlights"}</FormLabel>
              <FormControl>
                <AiEditor
                  {...field}
                  className="h-60"
                  prompt={improvePromptIn(improvePrompts.capability_highlights, language)}
                  placeholder={untranslatedPlaceholder(language, teamMember?.capability_highlights)}
                />
              </FormControl>
              <EnglishReference language={language} text={teamMember?.capability_highlights} />
              <FormMessage />
            </FormItem>
          )}
        />

        {/* Hidden while capabilities are off; the team member's saved ones are kept as they are */}
        {showsCapabilities && <Capabilities form={form} capabilities={capabilities} disabled={translating} />}
        <Experiences
          form={form}
          language={language}
          experiences={teamMember?.experiences}
          onOpenChange={experienceReview.onOpenChange}
          aiTranslated={experienceReview.isAiTranslated}
          imageReset={imageReset}
        />

        <div className="w-full text-right">
          <LoadingButton
            state={form.formState.isSubmitting ? LoadingButtonState.Loading : LoadingButtonState.Idle}
            type="submit"
            // Saving while the AI translation runs would save the text from before it and drop the translation
            disabled={aiTranslation.pending !== null}
            text={
              translating
                ? `Save ${languageLabel(language)} translation`
                : `${teamMember ? "Update" : "Create"} ${inSentence(labels.teamMembers.singular)}`
            }
            loadingText={translating ? "Saving..." : `${teamMember ? "Updating" : "Creating"}...`}
          />
        </div>
      </form>
    </Form>
  )
}
