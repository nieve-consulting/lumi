"use client"

import { createContext, useContext } from "react"

import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"

import { fieldId, type FieldErrors } from "./form"

// Labelled fields of the business settings forms, each pointing to its hint and error so screen readers read them with it

export const CompactFieldsContext = createContext(false)

interface FieldProps {
  // The setting's field, as problems name it, e.g. "contactEmail" or "starters.0.label.en"
  field: string
  label: React.ReactNode
  hint?: React.ReactNode
  errors: FieldErrors
  required?: boolean
}

export function describedBy(field: string, errors: FieldErrors, hint?: React.ReactNode) {
  const id = fieldId(field)
  return [hint ? `${id}-hint` : "", errors[field] ? `${id}-error` : ""].filter(Boolean).join(" ") || undefined
}

export function FieldHint({ field, children }: { field: string; children?: React.ReactNode }) {
  if (!children) return null
  return (
    <p id={`${fieldId(field)}-hint`} className="text-sm text-slate-600">
      {children}
    </p>
  )
}

export function FieldError({ field, errors }: { field: string; errors: FieldErrors }) {
  if (!errors[field]) return null
  return (
    <p id={`${fieldId(field)}-error`} className="text-sm font-medium text-red-700">
      {errors[field]}
    </p>
  )
}

// Marks the field required, or optional outside the compact admin layout (CompactFieldsContext)
export function FieldLabel({ field, label, required }: Pick<FieldProps, "field" | "label" | "required">) {
  const compact = useContext(CompactFieldsContext)
  return (
    <Label htmlFor={fieldId(field)}>
      {label}{" "}
      {required ? (
        <span className="ml-1 font-normal text-slate-600">(required)</span>
      ) : !compact ? (
        <span className="ml-1 font-normal text-slate-600">(optional)</span>
      ) : null}
    </Label>
  )
}

type TextFieldProps = FieldProps & {
  value: string
  onChange: (value: string) => void
  type?: "text" | "url" | "email" | "tel" | "password"
  placeholder?: string
  autoComplete?: string
  maxLength?: number
}

export function TextField({
  field,
  label,
  hint,
  errors,
  required,
  value,
  onChange,
  type = "text",
  placeholder,
  autoComplete,
  maxLength,
}: TextFieldProps) {
  return (
    <div className="space-y-2">
      <FieldLabel field={field} label={label} required={required} />
      <FieldHint field={field}>{hint}</FieldHint>
      <Input
        id={fieldId(field)}
        type={type}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        autoComplete={autoComplete ?? "off"}
        maxLength={maxLength}
        aria-required={required || undefined}
        aria-invalid={errors[field] ? true : undefined}
        aria-describedby={describedBy(field, errors, hint)}
        className="max-w-xl"
      />
      <FieldError field={field} errors={errors} />
    </div>
  )
}

type TextAreaFieldProps = FieldProps & { value: string; onChange: (value: string) => void; rows?: number; maxLength?: number; placeholder?: string }

export function TextAreaField({ field, label, hint, errors, required, value, onChange, rows = 4, maxLength, placeholder }: TextAreaFieldProps) {
  return (
    <div className="space-y-2">
      <FieldLabel field={field} label={label} required={required} />
      <FieldHint field={field}>{hint}</FieldHint>
      <Textarea
        id={fieldId(field)}
        value={value}
        rows={rows}
        maxLength={maxLength}
        placeholder={placeholder}
        onChange={(event) => onChange(event.target.value)}
        aria-required={required || undefined}
        aria-invalid={errors[field] ? true : undefined}
        aria-describedby={describedBy(field, errors, hint)}
        className="max-w-xl"
      />
      {maxLength && (
        <p className="text-xs text-slate-600" aria-hidden>
          {value.length}/{maxLength}
        </p>
      )}
      <FieldError field={field} errors={errors} />
    </div>
  )
}

type SelectFieldProps = FieldProps & { value: string; onChange: (value: string) => void; options: { value: string; label: string }[] }

// A native select, which keyboards and screen readers handle everywhere
export function SelectField({ field, label, hint, errors, required, value, onChange, options }: SelectFieldProps) {
  return (
    <div className="space-y-2">
      <FieldLabel field={field} label={label} required={required} />
      <FieldHint field={field}>{hint}</FieldHint>
      <select
        id={fieldId(field)}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        aria-invalid={errors[field] ? true : undefined}
        aria-describedby={describedBy(field, errors, hint)}
        className="border-input bg-background focus-visible:ring-ring flex h-10 w-full max-w-xs rounded-md border px-3 py-2 text-sm focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none"
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      <FieldError field={field} errors={errors} />
    </div>
  )
}
