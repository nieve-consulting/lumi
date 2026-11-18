"use client"

import { useMemo, useState } from "react"
import type { Capability } from "@/generated/graphql"
import { inSentence } from "@lumi/shared-contracts/knowledge"
import { ColumnFiltersState, ColumnVisibilityState, flexRender, SortingState, useTable } from "@tanstack/react-table"

import { dataTableFeatures } from "@/lib/dataTable"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { useSourceLabels } from "@/app/admin/components/SourceLabelsProvider"
import { DataTablePagination } from "@/app/admin/components/table/DataTablePagination"
import BulkTranslateToolbar from "@/app/admin/components/translations/BulkTranslateToolbar"
import { needsBulkTranslation } from "@/app/admin/components/translations/languages"

import { useCapabilityStore } from "../../storeProvider"
import CapabilityDeleteModal from "../CapabilityDeleteModal"
import CapabilityFormModal from "../CapabilityFormModal"
import { capabilityColumns } from "./Columns"
import DataTableRow from "./DataTableRow"

interface DataTableProps {
  data: Capability[]
}

export function DataTable({ data }: DataTableProps) {
  const setItemForForm = useCapabilityStore((state) => state.setItemForForm)
  const labels = useSourceLabels()
  const singular = inSentence(labels.capabilities.singular)
  const plural = inSentence(labels.capabilities.plural)
  const columns = useMemo(() => capabilityColumns(setItemForForm), [setItemForForm])
  const [rowSelection, setRowSelection] = useState({})
  const [columnVisibility, setColumnVisibility] = useState<ColumnVisibilityState>({})
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([])
  const [sorting, setSorting] = useState<SortingState>([])

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
    },
    enableRowSelection: true,
    onRowSelectionChange: setRowSelection,
    onSortingChange: setSorting,
    onColumnFiltersChange: setColumnFilters,
    onColumnVisibilityChange: setColumnVisibility,
  })

  const rows = table.getRowModel().rows

  return (
    <div className="space-y-4">
      <BulkTranslateToolbar
        table={table}
        type="capability"
        names={{ singular, plural }}
        getName={(capability) => capability.name}
        needsTranslation={(capability, language, mode) => needsBulkTranslation(mode, capability.translations, language)}
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
              rows.map((row) => <DataTableRow key={row.id} row={row} />)
            ) : (
              <TableRow>
                <TableCell colSpan={columns.length} className="h-24 text-center text-slate-400">
                  {columnFilters.length ? `No ${plural} match this filter.` : `No ${plural} yet.`}
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
      <DataTablePagination table={table} />
      <CapabilityDeleteModal />
      <CapabilityFormModal />
    </div>
  )
}
