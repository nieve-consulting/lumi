"use client"

import { useCallback, useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import type { Capability, Client, Project, TeamMember } from "@/generated/graphql"
import { inSentence } from "@lumi/shared-contracts/knowledge"
import { DEFAULT_LANGUAGE, type Language } from "@lumi/shared-contracts/language"
import { ChevronDownIcon, ImageIcon } from "lucide-react"

import { assertSaved, cn } from "@/lib/utils"
import { buttonVariants } from "@/components/ui/button"
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form"
import { Input } from "@/components/ui/input"
import { LoadingButton, LoadingButtonState } from "@/components/ui/loading-button"
import { Switch } from "@/components/ui/switch"
import { useToast } from "@/components/ui/use-toast"
import FileUpload from "@/components/FileUpload"
import AiEditor from "@/components/MdEditor/AiEditor"
import MonthYearPicker from "@/components/MonthYearPicker"
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
  addCapabilitiesToProject,
  addTeamMembersToProject,
  createProject,
  linkUploadToProjectImage,
  removeCapabilitiesFromProject,
  removeTeamMembersFromProject,
  updateProject,
  updateProjectTeamMember,
} from "../../actions"
import Capabilities from "./Capabilities"
import {
  contributionFieldDescriptions,
  contributionHasEnglish,
  projectContentFields,
  projectContentSchema,
  projectFieldDescriptions,
  projectOptionalContentFields,
  projectRecordKind,
  projectSchemaFactory,
  type ProjectFormSchema,
  type ProjectLocationEnum,
  type ProjectTeamMemberSchema,
} from "./schema"
import TeamMembers from "./TeamMembers"

const improvePrompts = {
  summary: "This text will be used to provide a short summary for one of our company's projects. Refer to them in 3rd person",
  description:
    "This text will be used to describe a project that we have done more extensively. The goal is to genereate trust with a potentail future client.  Refer to them in 3rd person",
}

interface IProps {
  project?: Project
  // Language the form opens in. New projects are created in English
  language?: Language
  clients: Client[]
  teamMembers: TeamMember[]
  capabilities: Capability[]
}

async function addImageToProject(projectId: string, file: File) {
  return linkUploadToProjectImage(await uploadImage(file, "project image"), projectId)
}

// The form's values in a language: the shared fields, plus the project's and its contributions' content in that language.
// The project is read in English, so English takes its own fields
function projectFormValues(project: Project | undefined, language: Language): ProjectFormSchema {
  const english = language === DEFAULT_LANGUAGE
  const content = english
    ? {
        name: project?.name || "",
        industry: project?.industry || "",
        type: project?.type || "",
        summary: project?.summary || "",
        description: project?.description || "",
      }
    : contentValues(findTranslation(project?.translations, language), projectContentFields)

  return {
    ...content,
    start_date: project?.start_date ? new Date(project.start_date) : new Date(),
    end_date: project?.end_date ? new Date(project.end_date) : undefined,
    location: (project?.location as ProjectLocationEnum) || "HYBRID",
    client_id: project?.client?.id || "",
    webpage: project?.webpage || "",
    url_slug: project?.url_slug || "",
    published: project?.published ?? false,
    teamMembers:
      project?.teamMembers?.map((c) => {
        if (c?.teamMember) {
          return {
            ...c.teamMember,
            description: english ? c.description || "" : (findTranslation(c.translations, language)?.description ?? ""),
            teamMemberId: c.teamMember.id,
            start_date: c?.start_date ? new Date(c.start_date) : new Date(),
            end_date: c?.end_date ? new Date(c.end_date) : undefined,
          }
        }
        throw new Error("Team member is undefined")
      }) || [],
    capabilities:
      project?.capabilities?.map((s) => {
        if (s) {
          return { ...s, capabilityId: s.id }
        }
        throw new Error("Capability is undefined")
      }) || [],
  }
}

// The project's and its contributions' content fields the AI translation fills, from the form's values in a language
// While team members are off their contributions are hidden, so the AI translation leaves them out
function projectTranslatableFields(values: ProjectFormSchema, withContributions: boolean): TranslatableField<ProjectFormSchema>[] {
  return [
    ...translatableFields<ProjectFormSchema>(values, projectFieldDescriptions),
    ...(withContributions ? (values.teamMembers ?? []) : []).flatMap((contribution, index) =>
      translatableFields<ProjectFormSchema>(contribution, contributionFieldDescriptions(contribution.name), {
        path: `teamMembers.${index}`,
        item: contribution.teamMemberId,
      })
    ),
  ]
}

export default function ProjectForm({ project, language: initialLanguage = DEFAULT_LANGUAGE, clients, teamMembers, capabilities }: IProps) {
  const projectSchema = useMemo(() => projectSchemaFactory(clients), [clients])
  const { toast } = useToast()
  const router = useRouter()
  const labels = useSourceLabels()
  const contributionNames = {
    singular: `${inSentence(labels.teamMembers.singular)} contribution`,
    plural: `${inSentence(labels.teamMembers.singular)} contributions`,
  }
  // Sections of sources that are off are hidden; the project's saved links to them are kept as they are
  const showsClients = useShowsSource("clients")
  const showsTeamMembers = useShowsSource("teamMembers")
  const showsCapabilities = useShowsSource("capabilities")

  const startLanguage = project ? initialLanguage : DEFAULT_LANGUAGE
  const valuesFor = useCallback((language: Language) => projectFormValues(project, language), [project])
  const { form, contentLanguage, language, translating } = useTranslatableForm({
    schema: projectSchema,
    contentSchema: projectContentSchema,
    initialLanguage: startLanguage,
    valuesFor,
  })
  // Contributions opened for review, by team member id: an outdated one, an AI draft, or one the AI translation filled, is
  // saved only once reviewed
  const contributionReview = useNestedReview(language)
  // Remounts the image picker when a picked image is removed, so its preview goes too
  const [imageReset, setImageReset] = useState(0)
  const aiTranslation = useAiTranslation({
    form,
    language,
    record: projectRecordKind,
    translations: project?.translations,
    fieldsIn: (from) => projectTranslatableFields(valuesFor(from), showsTeamMembers),
    items: showsTeamMembers ? contributionNames : undefined,
    review: contributionReview,
  })
  // Contributions missing, drafts or outdated in a language: the project needs reviewing there too, unless team members are off
  // and the contributions hidden
  const contributionsNeedingReview = (language: Language) =>
    nestedNeedingReview(showsTeamMembers ? project?.teamMembers : [], language, contributionHasEnglish)

  function onImageSelected(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (file) {
      // Dirty, so switching language asks before discarding the picked image
      form.setValue("project_image", file, { shouldDirty: true })
    }
  }

  // Saves the content in the language being edited, and only that language. Shared fields and relations are edited in
  // English: the shared fields are sent as the API requires them, which it ignores
  // Returns how many contributions were left out as unreviewed
  async function saveTranslation(project: Project, data: ProjectFormSchema) {
    const input = untranslatedAsNull(
      { ...data, teamMembers: undefined, capabilities: undefined, project_image: undefined },
      projectOptionalContentFields,
      language
    )
    const promises: Promise<unknown>[] = [updateProject(project.id, input, language)]

    const unreviewed: Unreviewed = { unopened: 0, aiTranslated: 0 }
    // While team members are off their contributions are hidden, and saved as they are
    const contributions = (showsTeamMembers ? (data.teamMembers ?? []) : [])
      .map((c) => untranslatedAsNull(c, ["description"], language))
      .filter((c) => {
        const saved = findTranslation(project.teamMembers?.find((pc) => pc?.teamMember?.id === c.teamMemberId)?.translations, language)
        if (contributionReview.isAiTranslated(c.teamMemberId)) {
          unreviewed.aiTranslated++
          return false
        }
        if (isUnreviewed(saved, { description: c.description }, contributionReview.isOpened(c.teamMemberId))) {
          unreviewed.unopened++
          return false
        }
        return true
      })
    if (contributions.length) {
      promises.push(updateProjectTeamMember(project.id, contributions, language))
    }

    assertTranslationSaved(await Promise.all(promises), language)
    return unreviewed
  }

  async function onSubmit(data: ProjectFormSchema) {
    try {
      if (project && translating) {
        const unreviewed = await saveTranslation(project, data)
        toast({
          title: `${languageLabel(language)} translation of ${project.name} saved`,
          description: unreviewedNote(unreviewed, contributionNames, language),
        })
      } else if (project) {
        await assertImageUploads([data.project_image])
        const updatePromises: Promise<unknown>[] = [
          updateProject(project.id, { ...data, teamMembers: undefined, capabilities: undefined, project_image: undefined }),
        ]

        const newTeamMembers: ProjectTeamMemberSchema[] = []
        const updatedTeamMembers: ProjectTeamMemberSchema[] = []
        const deletedTeamMemberIds: string[] = []

        if (data.teamMembers) {
          data.teamMembers.forEach((c) => {
            const original = project.teamMembers?.find((ck) => ck?.teamMember?.id == c.teamMemberId)

            if (original) {
              if (Object.keys(c).some((key) => key in original && original[key as keyof typeof original] != c[key as keyof typeof c])) {
                updatedTeamMembers.push(c)
              }
            } else {
              newTeamMembers.push(c)
            }
          })

          project.teamMembers?.forEach((c) => {
            if (c?.teamMember) {
              if (!data.teamMembers!.find((d) => d.teamMemberId === c.teamMember?.id)) {
                deletedTeamMemberIds.push(c.teamMember.id)
              }
            }
          })

          if (newTeamMembers.length) {
            updatePromises.push(addTeamMembersToProject(project.id, newTeamMembers))
          }

          if (updatedTeamMembers.length) {
            updatePromises.push(updateProjectTeamMember(project.id, updatedTeamMembers))
          }

          if (deletedTeamMemberIds.length) {
            updatePromises.push(removeTeamMembersFromProject(project.id, deletedTeamMemberIds))
          }

          if (data.project_image) {
            updatePromises.push(addImageToProject(project.id, data.project_image))
          }
        }

        if (data.capabilities) {
          const newCapabilities: string[] = []
          const deletedCapabilityIds: string[] = []

          data.capabilities.forEach((s) => {
            const original = project.capabilities?.find((sk) => sk?.id == s.capabilityId)
            if (!original) {
              newCapabilities.push(s.capabilityId)
            }
          })

          project.capabilities?.forEach((s) => {
            if (s) {
              if (!data.capabilities!.find((d) => d.capabilityId === s.id)) {
                deletedCapabilityIds.push(s.id)
              }
            }
          })

          if (newCapabilities.length) {
            updatePromises.push(addCapabilitiesToProject(project.id, newCapabilities))
          }

          if (deletedCapabilityIds.length) {
            updatePromises.push(removeCapabilitiesFromProject(project.id, deletedCapabilityIds))
          }
        }

        assertSaved(await Promise.all(updatePromises), `${project.name} couldn't be updated. Check the fields and try again.`)
        toast({ title: `${data.name} has been updated` })
      } else {
        await assertImageUploads([data.project_image])
        const projectId = await createProject({
          ...data,
          teamMembers: undefined,
          project_image: undefined,
          capabilities: undefined,
          client_id: data.client_id || undefined,
        })

        if (projectId) {
          const addPromises: Promise<unknown>[] = []

          if (data.project_image) {
            addPromises.push(addImageToProject(projectId, data.project_image))
          }

          if (data.teamMembers) {
            addPromises.push(addTeamMembersToProject(projectId, data.teamMembers))
          }
          if (data.capabilities && data.capabilities.length > 0) {
            addPromises.push(
              addCapabilitiesToProject(
                projectId,
                data.capabilities.map((s) => s.capabilityId)
              )
            )
          }

          const imageSaved = await settleAfterCreate(addPromises)
          toast(
            imageSaved
              ? { title: `${data.name} has been created` }
              : {
                  variant: "destructive",
                  title: `${data.name} has been created`,
                  description: "Its image couldn't be uploaded. Open it from the list to add the image again.",
                }
          )
        } else {
          throw new Error(`Error creating ${inSentence(labels.projects.singular)}`)
        }
      }

      router.replace("/admin/projects")
    } catch (e) {
      console.error(e)
      const err = e as Error
      if (err instanceof MediaStorageNotConfiguredError) {
        form.setValue("project_image", undefined)
        setImageReset((count) => count + 1)
      }
      toast({ variant: "destructive", title: "Error", description: err.message })
    }
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8">
        {project ? (
          <div className="space-y-3">
            <LanguageSwitcher
              control={contentLanguage}
              translations={project.translations}
              getStatus={(option) => recordTranslationStatus(project.translations, option, contributionsNeedingReview(option))}
            >
              <AiTranslateButton control={aiTranslation} />
            </LanguageSwitcher>
            <TranslationNotice
              language={language}
              translations={project.translations}
              required={["Name"]}
              nestedReview={{
                ...contributionsNeedingReview(language),
                ...contributionNames,
                aiTranslated: contributionReview.aiTranslatedCount,
              }}
            />
          </div>
        ) : (
          <EnglishFirstNote />
        )}
        <div className="flex gap-2">
          {/* Remounted per language and when the picked image is removed, so its preview goes with it */}
          <FileUpload
            key={`${language}-${imageReset}`}
            variant="square"
            className="rounded-md"
            imageSrc={project && project.image_key ? `/media/${project.image_key}?w=150&h=150` : undefined}
            fallback={<ImageIcon size={50} />}
            uploadCta="Upload Image"
            onChange={onImageSelected}
            disabled={translating}
          />
          <div className="flex-grow">
            <div className="flex gap-10">
              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem className="flex-grow">
                    <FormLabel>Name</FormLabel>
                    <FormControl>
                      <Input {...field} placeholder={untranslatedPlaceholder(language, project?.name, { required: true })} />
                    </FormControl>
                    <EnglishText language={language} text={project?.name} />
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="url_slug"
                render={({ field }) => (
                  <FormItem className="flex-grow">
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
                  <FormItem className="flex-grow">
                    <FormLabel>Webpage</FormLabel>
                    <FormControl>
                      <Input {...field} disabled={translating} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
            <div className="flex gap-10">
              <FormField
                control={form.control}
                name="industry"
                render={({ field }) => (
                  <FormItem className="flex-grow">
                    <FormLabel>Industry</FormLabel>
                    <FormControl>
                      <Input {...field} placeholder={untranslatedPlaceholder(language, project?.industry)} />
                    </FormControl>
                    <EnglishText language={language} text={project?.industry} />
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="type"
                render={({ field }) => (
                  <FormItem className="flex-grow">
                    <FormLabel>Type</FormLabel>
                    <FormControl>
                      <Input
                        {...field}
                        placeholder={untranslatedPlaceholder(language, project?.type, {
                          placeholder: "E.g. AI Agent, AI Chatbot, Data Visualization, etc",
                        })}
                      />
                    </FormControl>
                    <EnglishText language={language} text={project?.type} />
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
          </div>
        </div>
        <div className="flex gap-10">
          {showsClients && (
            <FormField
              control={form.control}
              name="client_id"
              render={({ field }) => (
                <FormItem className="flex-grow">
                  <FormLabel>{labels.clients.singular}</FormLabel>
                  <div className="relative w-full">
                    <FormControl>
                      <select
                        className={cn(buttonVariants({ variant: "outline" }), "w-full appearance-none font-normal")}
                        {...field}
                        disabled={translating}
                      >
                        <option value="">None</option>
                        {clients.map((client) => (
                          <option key={client.id} value={client.id}>
                            {client.name}
                          </option>
                        ))}
                      </select>
                    </FormControl>
                    <ChevronDownIcon className="absolute top-2.5 right-3 h-4 w-4 opacity-50" />
                  </div>
                  <FormDescription>Leave empty if there is none</FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
          )}
          <FormField
            control={form.control}
            name="start_date"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Start Date</FormLabel>
                <FormControl>
                  <MonthYearPicker {...field} yearRange={[5, 0]} allowEmpty={false} disabled={translating} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="end_date"
            render={({ field }) => (
              <FormItem>
                <FormLabel>End Date</FormLabel>
                <FormControl>
                  <MonthYearPicker {...field} yearRange={[5, 0]} allowEmpty={true} disabled={translating} />
                </FormControl>
                <FormMessage />
                <FormDescription>Leave empty if still ongoing</FormDescription>
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="location"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Location</FormLabel>
                <div className="relative w-max">
                  <FormControl>
                    <select
                      className={cn(buttonVariants({ variant: "outline" }), "w-[200px] appearance-none font-normal")}
                      {...field}
                      disabled={translating}
                    >
                      <option value="REMOTE">Remote</option>
                      <option value="HYBRID">Hybrid</option>
                      <option value="ONSITE">On Site</option>
                    </select>
                  </FormControl>
                  <ChevronDownIcon className="absolute top-2.5 right-3 h-4 w-4 opacity-50" />
                </div>
                <FormMessage />
              </FormItem>
            )}
          />
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
                  placeholder={untranslatedPlaceholder(language, project?.summary)}
                />
              </FormControl>
              <FormDescription>A short intro of the {inSentence(labels.projects.singular)}</FormDescription>
              <EnglishReference language={language} text={project?.summary} />
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
                  placeholder={untranslatedPlaceholder(language, project?.description)}
                />
              </FormControl>
              <EnglishReference language={language} text={project?.description} />
              <FormMessage />
            </FormItem>
          )}
        />
        {showsTeamMembers && (
          <TeamMembers
            form={form}
            teamMembers={teamMembers}
            language={language}
            contributions={project?.teamMembers}
            onOpenChange={contributionReview.onOpenChange}
            aiTranslated={contributionReview.isAiTranslated}
          />
        )}
        {showsCapabilities && <Capabilities form={form} capabilities={capabilities} disabled={translating} />}

        <div className="w-full text-right">
          <LoadingButton
            state={form.formState.isSubmitting ? LoadingButtonState.Loading : LoadingButtonState.Idle}
            type="submit"
            // Saving while the AI translation runs would save the text from before it and drop the translation
            disabled={aiTranslation.pending !== null}
            text={
              translating ? `Save ${languageLabel(language)} translation` : `${project ? "Update" : "Create"} ${inSentence(labels.projects.singular)}`
            }
            loadingText={translating ? "Saving..." : `${project ? "Updating" : "Creating"}...`}
          />
        </div>
      </form>
    </Form>
  )
}
