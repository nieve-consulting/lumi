"use client"

import { useState } from "react"
import type { JobOpening } from "@/generated/graphql"
import { inSentence } from "@lumi/shared-contracts/knowledge"
import { ColumnDef, ColumnFiltersState, ColumnVisibilityState, flexRender, SortingState, useTable } from "@tanstack/react-table"
import { useRouter } from "nextjs-toploader/app"

import { dataTableFeatures, searchFilterFn, type DataTableFeatures } from "@/lib/dataTable"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { useSourceLabels } from "@/app/admin/components/SourceLabelsProvider"
import { DataTablePagination } from "@/app/admin/components/table/DataTablePagination"
import BulkTranslateToolbar from "@/app/admin/components/translations/BulkTranslateToolbar"
import { needsBulkTranslation } from "@/app/admin/components/translations/languages"

import JobOpeningDeleteModal from "../JobOpeningDeleteModal"
import { JobOpeningStoreProvider } from "./storeProvider"

// Columns the search looks through
const searchableColumns = ["title", "location"]

interface DataTableProps {
  columns: ColumnDef<DataTableFeatures, JobOpening>[]
  data: JobOpening[]
}

export function DataTable({ columns, data }: DataTableProps) {
  const labels = useSourceLabels()
  const singular = inSentence(labels.jobOpenings.singular)
  const plural = inSentence(labels.jobOpenings.plural)
  const [rowSelection, setRowSelection] = useState({})
  const [columnVisibility, setColumnVisibility] = useState<ColumnVisibilityState>({})
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([])
  const [globalFilter, setGlobalFilter] = useState("")
  const [sorting, setSorting] = useState<SortingState>([])
  const router = useRouter()

  const handleRowClick = (id: string) => {
    router.push(`/admin/job-openings/edit/${id}`)
  }

  const table = useTable({
    features: dataTableFeatures,
    data,
    columns,
    // Selection follows the records when the list refreshes, e.g. after a bulk translation
    getRowId: (row) => row.id,
    state: {
      sorting,
      columnVisibility,
      rowSelection,
      columnFilters,
      globalFilter,
    },
    enableRowSelection: true,
    globalFilterFn: searchFilterFn,
    getColumnCanGlobalFilter: (column) => searchableColumns.includes(column.id),
    onRowSelectionChange: setRowSelection,
    onSortingChange: setSorting,
    onColumnFiltersChange: setColumnFilters,
    onColumnVisibilityChange: setColumnVisibility,
    onGlobalFilterChange: setGlobalFilter,
  })

  const rows = table.getRowModel().rows
  const isFiltered = columnFilters.length > 0 || globalFilter.trim() !== ""

  return (
    <div className="space-y-4">
      <JobOpeningStoreProvider>
        <div role="search" aria-label={labels.jobOpenings.plural} className="grid max-w-sm gap-1.5">
          <Label htmlFor="job-opening-search">Search</Label>
          <Input
            id="job-opening-search"
            type="search"
            placeholder="Title or location"
            value={globalFilter}
            onChange={(e) => setGlobalFilter(e.target.value)}
          />
        </div>
        <BulkTranslateToolbar
          table={table}
          type="job_opening"
          names={{ singular, plural }}
          getName={(jobOpening) => jobOpening.title}
          needsTranslation={(jobOpening, language, mode) => needsBulkTranslation(mode, jobOpening.translations, language)}
        />
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              {table.getHeaderGroups().map((headerGroup) => (
                <TableRow key={headerGroup.id}>
                  {headerGroup.headers.map((header) => {
                    return (
                      <TableHead key={header.id} colSpan={header.colSpan}>
                        {header.isPlaceholder ? null : flexRender(header.column.columnDef.header, header.getContext())}
                      </TableHead>
                    )
                  })}
                </TableRow>
              ))}
            </TableHeader>
            <TableBody>
              {rows?.length ? (
                rows.map((row) => (
                  <TableRow
                    key={row.id}
                    className="cursor-pointer"
                    data-state={row.getIsSelected() && "selected"}
                    onClick={() => handleRowClick(row.original.id)}
                  >
                    {row.getVisibleCells().map((cell) => (
                      <TableCell key={cell.id}>{flexRender(cell.column.columnDef.cell, cell.getContext())}</TableCell>
                    ))}
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell colSpan={columns.length} className="h-24 text-center text-slate-400">
                    {isFiltered ? `No ${plural} match this search or filter.` : `No ${plural} yet.`}
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
        <DataTablePagination table={table} />
        <JobOpeningDeleteModal />
      </JobOpeningStoreProvider>
    </div>
  )
}
