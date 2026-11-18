import { CirclePlus, Trash } from "lucide-react"
import { useFieldArray, type UseFormReturn } from "react-hook-form"

import { Button } from "@/components/ui/button"
import { FormControl, FormField, FormItem, FormMessage } from "@/components/ui/form"
import { Input } from "@/components/ui/input"

import type { WebsiteFormSchema } from "./schema"

interface IProps {
  form: UseFormReturn<WebsiteFormSchema>
}

export default function Exclude({ form }: IProps) {
  const pathsFieldArray = useFieldArray({
    control: form.control,
    name: "exclude_paths",
  })

  const url = form.watch("url")

  function onNewPathClicked(e: React.MouseEvent<HTMLButtonElement, MouseEvent>) {
    e.preventDefault()
    pathsFieldArray.append({ path: "" })
  }

  return (
    <>
      <div className="flex items-center justify-between">
        <div className="text-xl font-bold">Exclude Paths</div>
        <Button variant="secondary" onClick={onNewPathClicked}>
          <CirclePlus size={18} className="mr-2" />
          Add Path
        </Button>
      </div>
      {pathsFieldArray.fields.length === 0 ? (
        <div className="col-span-5 text-center text-slate-400">No excluded paths</div>
      ) : (
        pathsFieldArray.fields.map((field, index) => (
          <div key={field.id} className="w-full">
            <div className="flex">
              <Button className="" onClick={() => pathsFieldArray.remove(index)} variant="link">
                <Trash size={18} className="text-destructive" />
              </Button>
              <FormField
                control={form.control}
                name={`exclude_paths.${index}.path`}
                render={({ field }) => (
                  <div className="grow">
                    <div className="flex">
                      <div className="rounded-l-md bg-slate-200 p-2 pr-0">{url}</div>
                      <FormItem className="grow">
                        <FormControl>
                          <Input {...field} className="rounded-l-none pl-0" />
                        </FormControl>
                      </FormItem>
                    </div>
                    <FormMessage className="mt-1" />
                  </div>
                )}
              />
            </div>
          </div>
        ))
      )}
    </>
  )
}
