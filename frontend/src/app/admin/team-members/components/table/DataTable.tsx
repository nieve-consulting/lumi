"use client"

import { useState } from "react"
import type { TeamMember } from "@/generated/graphql"
import { inSentence } from "@lumi/shared-contracts/knowledge"
import { ColumnDef, ColumnFiltersState, ColumnVisibilityState, flexRender, SortingState, useTable } from "@tanstack/react-table"
import { useRouter } from "nextjs-toploader/app"

import { dataTableFeatures, type DataTableFeatures } from "@/lib/dataTable"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { useSourceLabels } from "@/app/admin/components/SourceLabelsProvider"
import { DataTablePagination } from "@/app/admin/components/table/DataTablePagination"
import BulkTranslateToolbar from "@/app/admin/components/translations/BulkTranslateToolbar"
import { needsBulkTranslation } from "@/app/admin/components/translations/languages"

import TeamMemberDeleteModal from "../TeamMemberDeleteModal"
import { ResumesContext } from "./resumesContext"
import { TeamMemberStoreProvider } from "./storeProvider"

interface DataTableProps {
  columns: ColumnDef<DataTableFeatures, TeamMember>[]
  data: TeamMember[]
  // Whether each row offers the team member's resume
  resumes: boolean
}

export function DataTable({ columns, data, resumes }: DataTableProps) {
  const [rowSelection, setRowSelection] = useState({})
  const [columnVisibility, setColumnVisibility] = useState<ColumnVisibilityState>({})
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([])
  const [sorting, setSorting] = useState<SortingState>([])
  const router = useRouter()
  const labels = useSourceLabels()
  const singular = inSentence(labels.teamMembers.singular)
  const plural = inSentence(labels.teamMembers.plural)

  const handleRowClick = (id: string) => {
    router.push(`/admin/team-members/edit/${id}`)
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
      <TeamMemberStoreProvider>
        <ResumesContext value={resumes}>
          <BulkTranslateToolbar
            table={table}
            type="team_member"
            names={{ singular, plural, nested: "experiences" }}
            getName={(teamMember) => teamMember.name}
            needsTranslation={(teamMember, language, mode) => needsBulkTranslation(mode, teamMember.translations, language, teamMember.experiences)}
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
                      {columnFilters.length ? `No ${plural} match this filter.` : `No ${plural} yet.`}
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
          <DataTablePagination table={table} />
          <TeamMemberDeleteModal />
        </ResumesContext>
      </TeamMemberStoreProvider>
    </div>
  )
}
