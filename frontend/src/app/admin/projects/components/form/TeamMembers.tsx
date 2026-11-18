import { useMemo, useState } from "react"
import type { Maybe, TeamMember, TeamMemberInProject } from "@/generated/graphql"
import { inSentence } from "@lumi/shared-contracts/knowledge"
import { DEFAULT_LANGUAGE, type Language } from "@lumi/shared-contracts/language"
import { ChevronDown, CirclePlus, Trash } from "lucide-react"
import { useFieldArray, type UseFormReturn } from "react-hook-form"

import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible"
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command"
import { FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import AiEditor from "@/components/MdEditor/AiEditor"
import MonthYearPicker from "@/components/MonthYearPicker"
import { useSourceLabels } from "@/app/admin/components/SourceLabelsProvider"
import EnglishReference from "@/app/admin/components/translations/EnglishReference"
import { improvePromptIn, translationStatus, untranslatedPlaceholder } from "@/app/admin/components/translations/languages"
import TranslationStatusBadge, { AiTranslatedBadge } from "@/app/admin/components/translations/TranslationStatusBadge"

import { contributionHasEnglish, type ProjectFormSchema } from "./schema"

interface IProps {
  form: UseFormReturn<ProjectFormSchema>
  teamMembers: TeamMember[]
  // Language being edited. Outside English only the descriptions are edited: team members and dates are shared
  language?: Language
  // The project's saved contributions, read in English with their translations
  contributions?: Maybe<Maybe<TeamMemberInProject>[]>
  // Called with a saved contribution's team member id when it is opened, to review its translation, or closed
  onOpenChange?: (teamMemberId: string, open: boolean) => void
  // Whether a saved contribution, by its team member's id, was filled by the AI translation and not opened since
  aiTranslated?: (teamMemberId: string) => boolean
}

export default function TeamMembers({ form, teamMembers, language = DEFAULT_LANGUAGE, contributions, onOpenChange, aiTranslated }: IProps) {
  const sourceLabels = useSourceLabels()
  const labels = sourceLabels.teamMembers
  const [teamMemberSelectOpen, setTeamMemberSelectOpen] = useState<boolean>(false)
  const translating = language !== DEFAULT_LANGUAGE
  const savedContribution = (teamMemberId: string) => contributions?.find((c) => c?.teamMember?.id === teamMemberId)

  const teamMembersFieldArray = useFieldArray({
    control: form.control,
    name: "teamMembers",
  })
  const projectTeamMemberIds = useMemo(() => teamMembersFieldArray.fields.map((field) => field.teamMemberId), [teamMembersFieldArray])

  return (
    <>
      <div className="flex items-center justify-between">
        <div className="text-xl font-bold">{labels.plural}</div>
        <Popover open={teamMemberSelectOpen} onOpenChange={setTeamMemberSelectOpen}>
          <PopoverTrigger asChild>
            <Button variant="secondary" disabled={translating}>
              <CirclePlus size={18} className="mr-2" />
              Add {inSentence(labels.singular)}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-[200px] p-0">
            <Command>
              <CommandInput placeholder={`Search ${inSentence(labels.plural)}...`} />
              <CommandList>
                <CommandEmpty>No {inSentence(labels.plural)} found.</CommandEmpty>
                <CommandGroup>
                  {teamMembers
                    .filter((teamMember) => teamMember && !projectTeamMemberIds.includes(teamMember.id))
                    .map((teamMember) => (
                      <CommandItem
                        key={teamMember.id}
                        value={teamMember.name}
                        onSelect={() => {
                          setTeamMemberSelectOpen(false)
                          if (teamMember) {
                            teamMembersFieldArray.prepend({
                              teamMemberId: teamMember.id,
                              name: teamMembers.find((c) => c.id === teamMember.id)?.name || "",
                              description: "",
                              start_date: new Date(),
                              end_date: undefined,
                            })
                          }
                        }}
                      >
                        {teamMember.name}
                      </CommandItem>
                    ))}
                </CommandGroup>
              </CommandList>
            </Command>
          </PopoverContent>
        </Popover>
      </div>
      <div>
        {teamMembersFieldArray.fields.length === 0 ? (
          <div className="col-span-5 text-center text-slate-400">No {inSentence(labels.plural)} yet</div>
        ) : (
          teamMembersFieldArray.fields.map((field, index) => {
            const saved = savedContribution(field.teamMemberId)
            const status = translating && saved && contributionHasEnglish(saved) ? translationStatus(saved.translations, language) : undefined

            return (
              <Collapsible
                key={field.id}
                onOpenChange={(open) => saved && onOpenChange?.(field.teamMemberId, open)}
                className="mb-3 w-full rounded border border-slate-300"
              >
                <CollapsibleTrigger
                  className={cn("flex w-full items-center gap-2 bg-slate-200 px-4 py-2 text-left", {
                    "rounded-t bg-red-400 text-white": form.formState.errors.teamMembers?.[index],
                  })}
                >
                  {field.name}
                  {saved && aiTranslated?.(field.teamMemberId) ? (
                    <AiTranslatedBadge />
                  ) : (
                    status && status !== "translated" && <TranslationStatusBadge status={status} />
                  )}
                  <ChevronDown size={18} className="ml-auto" />
                </CollapsibleTrigger>
                <CollapsibleContent className="p-3">
                  <div className="flex gap-2">
                    <FormField
                      control={form.control}
                      name={`teamMembers.${index}.start_date`}
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
                      name={`teamMembers.${index}.end_date`}
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>End Date</FormLabel>
                          <FormControl>
                            <MonthYearPicker {...field} yearRange={[5, 0]} allowEmpty={true} disabled={translating} />
                          </FormControl>
                          <FormMessage />
                          <FormDescription>Leave empty if still ongoing, or to end with the project</FormDescription>
                        </FormItem>
                      )}
                    />
                  </div>
                  <FormField
                    control={form.control}
                    name={`teamMembers.${index}.description`}
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Contribution to the {inSentence(sourceLabels.projects.singular)}</FormLabel>
                        <FormControl>
                          <AiEditor
                            className="h-60"
                            {...field}
                            prompt={improvePromptIn("To be used as a description of a team member's involvement in a client project", language)}
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
                      <Button type="button" onClick={() => teamMembersFieldArray.remove(index)} variant="link">
                        <Trash size={18} className="text-destructive" />
                      </Button>
                    </div>
                  )}
                </CollapsibleContent>
              </Collapsible>
            )
          })
        )}
      </div>
    </>
  )
}
