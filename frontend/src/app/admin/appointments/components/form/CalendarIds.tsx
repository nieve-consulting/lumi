import { PlusCircle, Trash } from "lucide-react"
import { useFieldArray, type UseFormReturn } from "react-hook-form"

import { Button } from "@/components/ui/button"
import { FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form"
import { Input } from "@/components/ui/input"

import { type AppointmentsFormSchema } from "./schema"

interface IProps {
  form: UseFormReturn<AppointmentsFormSchema>
}

export function CalendarIds({ form }: IProps) {
  const { control } = form
  const { fields, remove, prepend } = useFieldArray({ control, name: "calendars" })

  return (
    <div>
      <div className="mb-2 flex gap-x-4">
        <FormLabel className="inline content-center">Calendars to create bookings on</FormLabel>
        <Button className="size-8 rounded-full" onClick={() => prepend({ value: "" })}>
          <PlusCircle />
        </Button>
      </div>

      {fields.map((field, index) => (
        <div className="mb-2 flex gap-x-4" key={field.id}>
          <FormField
            control={form.control}
            name={`calendars.${index}.value`}
            render={({ field }) => (
              <FormItem className="w-full">
                <FormControl>
                  <Input {...field} type="email" />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <Button variant="link" className="text-destructive size-8 rounded-full" onClick={() => remove(index)}>
            <Trash />
          </Button>
        </div>
      ))}
    </div>
  )
}
