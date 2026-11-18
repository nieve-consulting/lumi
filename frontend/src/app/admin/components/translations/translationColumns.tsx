"use client"

import { useId } from "react"
import Link from "next/link"
import type { Column, ColumnDef, FilterFn, ReactTable, RowData, SortFn } from "@tanstack/react-table"
import { ArrowDownIcon, ArrowUpDownIcon, ArrowUpIcon, FilterIcon } from "lucide-react"

import type { DataTableFeatures } from "@/lib/dataTable"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"

import {
  languageLabel,
  TRANSLATION_LANGUAGES,
  translationStatus,
  type Language,
  type TranslationStatus,
  type TranslationStatusLike,
} from "./languages"
import TranslationStatusBadge, { TRANSLATION_STATUS_LABELS } from "./TranslationStatusBadge"

// Rows of a records list with their translations, e.g. a query selecting `translations { language outdated draft }`
export interface TranslatedRow {
  translations: readonly TranslationStatusLike[]
}

interface Options<TData extends TranslatedRow> {
  // Where a status links to, e.g. the record's edit page with ?language= (withLanguageParam)
  getHref?: (row: TData, language: Language) => string
  // For lists that edit records in place, e.g. a modal: called when a status is picked
  onSelect?: (row: TData, language: Language) => void
  // The row's status in the language, for records whose nested items count too (recordTranslationStatus). Defaults to
  // the record's own translation status
  getStatus?: (row: TData, language: Language) => TranslationStatus
}

// Lists missing translations first, then AI drafts to review, then outdated ones, with outdated drafts between the two
const statusOrder: Record<TranslationStatus, number> = { missing: 0, draft: 1, outdated_draft: 2, outdated: 3, translated: 4 }

// An outdated draft shows under both "AI drafts" and "Outdated"
const filters = {
  all: undefined,
  todo: ["missing", "draft", "outdated_draft", "outdated"],
  missing: ["missing"],
  draft: ["draft", "outdated_draft"],
  outdated: ["outdated", "outdated_draft"],
  translated: ["translated"],
} satisfies Record<string, TranslationStatus[] | undefined>

export type TranslationFilterKey = keyof typeof filters

const filterLabels: Record<TranslationFilterKey, string> = {
  all: "All",
  todo: "Not up to date",
  missing: "Missing",
  draft: "AI drafts",
  outdated: "Outdated",
  translated: "Translated",
}

// The column filter value showing the rows of a filter, e.g. to show the AI drafts once a bulk translation ends:
// `table.getColumn(translationColumnId(language))?.setFilterValue(translationFilter("draft"))`
export const translationFilter = (key: TranslationFilterKey) => filters[key]

// Id of the language's translation column
export const translationColumnId = (language: Language) => `translation_${language}`

function filterKeyOf(value: unknown): TranslationFilterKey {
  if (!Array.isArray(value)) return "all"
  const key = (Object.keys(filters) as TranslationFilterKey[]).find((k) => {
    const statuses: TranslationStatus[] | undefined = filters[k]
    return statuses?.length === value.length && statuses.every((status) => value.includes(status))
  })
  return key ?? "all"
}

function TranslationColumnHeader<TData extends RowData>({ column, title }: { column: Column<DataTableFeatures, TData, unknown>; title: string }) {
  const sorted = column.getIsSorted()
  const filter = filterKeyOf(column.getFilterValue())

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="sm" className={cn("data-[state=open]:bg-accent -ml-3 h-8", filter !== "all" && "text-slate-900")}>
          <span>{title}</span>
          {filter !== "all" ? (
            <>
              <FilterIcon className="ml-2 h-4 w-4" aria-hidden />
              <span className="sr-only">, showing {filterLabels[filter].toLowerCase()}</span>
            </>
          ) : sorted === "desc" ? (
            <ArrowDownIcon className="ml-2 h-4 w-4" />
          ) : sorted === "asc" ? (
            <ArrowUpIcon className="ml-2 h-4 w-4" />
          ) : (
            <ArrowUpDownIcon className="ml-2 h-4 w-4" />
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start">
        <DropdownMenuItem onClick={() => column.toggleSorting(false)}>
          <ArrowUpIcon className="text-muted-foreground/70 mr-2 h-3.5 w-3.5" />
          Missing first
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => column.toggleSorting(true)}>
          <ArrowDownIcon className="text-muted-foreground/70 mr-2 h-3.5 w-3.5" />
          Translated first
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuLabel>Show</DropdownMenuLabel>
        <DropdownMenuRadioGroup value={filter} onValueChange={(value) => column.setFilterValue(filters[value as TranslationFilterKey])}>
          {(Object.keys(filters) as TranslationFilterKey[]).map((key) => (
            <DropdownMenuRadioItem key={key} value={key}>
              {filterLabels[key]}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

// Above a records list: a select per language other than English filtering the list by translation status, e.g. to show
// the records still missing Spanish. It shares its filter with the language column's header menu
export function TranslationStatusFilters<TData extends RowData>({ table }: { table: ReactTable<DataTableFeatures, TData> }) {
  const id = useId()

  return TRANSLATION_LANGUAGES.map((language) => {
    const column = table.getColumn(translationColumnId(language))
    if (!column) return null
    const selectId = `${id}-${language}`
    return (
      <div key={language} className="grid w-full gap-1.5 sm:w-48">
        <Label htmlFor={selectId}>{languageLabel(language)} translation</Label>
        <Select value={filterKeyOf(column.getFilterValue())} onValueChange={(value) => column.setFilterValue(filters[value as TranslationFilterKey])}>
          <SelectTrigger id={selectId} className="h-9">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {(Object.keys(filters) as TranslationFilterKey[]).map((key) => (
              <SelectItem key={key} value={key}>
                {filterLabels[key]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    )
  })
}

function TranslationStatusCell<TData extends TranslatedRow>({
  row,
  language,
  status,
  getHref,
  onSelect,
}: Options<TData> & { row: TData; language: Language; status: TranslationStatus }) {
  const badge = <TranslationStatusBadge status={status} />
  const verbs: Record<TranslationStatus, string> = {
    missing: "Add",
    draft: "Review",
    outdated_draft: "Review",
    outdated: "Review",
    translated: "Edit",
  }
  const action = `${verbs[status]} the ${languageLabel(language)} translation`
  const label = `${TRANSLATION_STATUS_LABELS[status]}: ${action}`
  const className = "focus-visible:ring-ring inline-flex rounded-full hover:opacity-80 focus-visible:ring-2 focus-visible:outline-none"

  if (getHref) {
    return (
      <Link href={getHref(row, language)} title={action} aria-label={label} className={className} onClick={(e) => e.stopPropagation()}>
        {badge}
      </Link>
    )
  }

  if (onSelect) {
    return (
      <button
        type="button"
        title={action}
        aria-label={label}
        className={className}
        onClick={(e) => {
          e.stopPropagation()
          onSelect(row, language)
        }}
      >
        {badge}
      </button>
    )
  }

  return badge
}

// One column per language other than English with each record's translation status in it, which can be sorted and
// filtered, e.g. to find the records still missing Spanish. Each status links to that translation
export function translationColumns<TData extends TranslatedRow>(options: Options<TData> = {}): ColumnDef<DataTableFeatures, TData>[] {
  return TRANSLATION_LANGUAGES.map((language): ColumnDef<DataTableFeatures, TData> => {
    const sortFn: SortFn<DataTableFeatures, TData> = (a, b, columnId) =>
      statusOrder[a.getValue<TranslationStatus>(columnId)] - statusOrder[b.getValue<TranslationStatus>(columnId)]
    const filterFn: FilterFn<DataTableFeatures, TData> = (row, columnId, value: TranslationStatus[] | undefined) =>
      !value || value.includes(row.getValue<TranslationStatus>(columnId))

    return {
      id: translationColumnId(language),
      accessorFn: (row: TData) => options.getStatus?.(row, language) ?? translationStatus(row.translations, language),
      sortFn,
      filterFn,
      header: ({ column }) => <TranslationColumnHeader column={column} title={languageLabel(language)} />,
      cell: ({ row }) => (
        <TranslationStatusCell
          row={row.original}
          language={language}
          status={row.getValue<TranslationStatus>(translationColumnId(language))}
          getHref={options.getHref}
          onSelect={options.onSelect}
        />
      ),
    }
  })
}
