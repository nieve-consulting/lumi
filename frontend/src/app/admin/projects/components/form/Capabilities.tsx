import { useMemo, useState } from "react"
import type { Capability } from "@/generated/graphql"
import { inSentence } from "@lumi/shared-contracts/knowledge"
import { CirclePlus, Trash } from "lucide-react"
import { useFieldArray, type UseFormReturn } from "react-hook-form"

import { Button } from "@/components/ui/button"
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { useSourceLabels } from "@/app/admin/components/SourceLabelsProvider"

import type { ProjectFormSchema } from "./schema"

interface IProps {
  form: UseFormReturn<ProjectFormSchema>
  capabilities: Capability[]
  // Shows the capabilities without letting them be added or removed, e.g. outside English as they are shared by every language
  disabled?: boolean
}

export default function Capabilities({ form, capabilities, disabled = false }: IProps) {
  const labels = useSourceLabels().capabilities
  const [capabilitySelectOpen, setCapabilitySelectOpen] = useState<boolean>(false)
  const capabilitiesFieldArray = useFieldArray({
    control: form.control,
    name: "capabilities",
  })
  const projectCapabilityIds = useMemo(() => capabilitiesFieldArray.fields.map((field) => field.capabilityId), [capabilitiesFieldArray])

  return (
    <>
      <div className="flex items-center justify-between">
        <div className="text-xl font-bold">{labels.plural}</div>
        <Popover open={capabilitySelectOpen} onOpenChange={setCapabilitySelectOpen}>
          <PopoverTrigger asChild>
            <Button variant="secondary" disabled={disabled}>
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
                  {capabilities
                    .filter((capability) => !projectCapabilityIds.includes(capability.id))
                    .map((capability) => (
                      <CommandItem
                        key={capability.id}
                        value={capability.name}
                        onSelect={() => {
                          setCapabilitySelectOpen(false)
                          capabilitiesFieldArray.prepend({
                            capabilityId: capability.id,
                            name: capabilities.find((s) => s.id === capability.id)?.name || "",
                          })
                        }}
                      >
                        {capability.name}
                      </CommandItem>
                    ))}
                </CommandGroup>
              </CommandList>
            </Command>
          </PopoverContent>
        </Popover>
      </div>
      <div className="grid grid-cols-5 gap-4">
        {capabilitiesFieldArray.fields.length === 0 ? (
          <div className="col-span-5 text-center text-slate-400">No {inSentence(labels.plural)} yet</div>
        ) : (
          capabilitiesFieldArray.fields.map((field, index) => (
            <div key={field.id} className="rounded-md border border-slate-200 bg-white p-2">
              <div className="flex items-center justify-between">
                <div className="text-lg font-semibold">{field.name}</div>
                {!disabled && (
                  <Button type="button" onClick={() => capabilitiesFieldArray.remove(index)} variant="link">
                    <Trash size={18} className="text-destructive" />
                  </Button>
                )}
              </div>
            </div>
          ))
        )}
      </div>
    </>
  )
}
