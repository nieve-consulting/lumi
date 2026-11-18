"use client"

import { useMemo, useState } from "react"
import type { Project } from "@/generated/graphql"
import { inSentence } from "@lumi/shared-contracts/knowledge"
import { ColumnFiltersState, ColumnVisibilityState, flexRender, SortingState, useTable } from "@tanstack/react-table"
import { useRouter } from "nextjs-toploader/app"

import { dataTableFeatures } from "@/lib/dataTable"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { useShowsSource, useSourceLabels } from "@/app/admin/components/SourceLabelsProvider"
import { DataTablePagination } from "@/app/admin/components/table/DataTablePagination"
import BulkTranslateToolbar from "@/app/admin/components/translations/BulkTranslateToolbar"
import { needsBulkTranslation } from "@/app/admin/components/translations/languages"

import { contributionHasEnglish } from "../form/schema"
import ProjectDeleteModal from "../ProjectDeleteModal"
import { projectColumns } from "./Columns"
import { ProjectStoreProvider } from "./storeProvider"

interface DataTableProps {
  data: Project[]
}

export function DataTable({ data }: DataTableProps) {
  const [rowSelection, setRowSelection] = useState({})
  // While team members are off, their contributions are left out of translation statuses and bulk translation
  const showsTeamMembers = useShowsSource("teamMembers")
  const columns = useMemo(() => projectColumns(showsTeamMembers), [showsTeamMembers])
  const labels = useSourceLabels()
  const singular = inSentence(labels.projects.singular)
  const plural = inSentence(labels.projects.plural)
  // The client column starts hidden while clients are off
  const showsClients = useShowsSource("clients")
  const [columnVisibility, setColumnVisibility] = useState<ColumnVisibilityState>(showsClients ? {} : { clientName: false })
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([])
  const [sorting, setSorting] = useState<SortingState>([])
  const router = useRouter()

  const handleRowClick = (id: string) => {
    router.push(`/admin/projects/edit/${id}`)
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
      <ProjectStoreProvider>
        <BulkTranslateToolbar
          table={table}
          type="project"
          names={{ singular, plural, nested: showsTeamMembers ? `${inSentence(labels.teamMembers.singular)} contributions` : undefined }}
          getName={(project) => project.name}
          needsTranslation={(project, language, mode) =>
            needsBulkTranslation(mode, project.translations, language, showsTeamMembers ? project.teamMembers : [], contributionHasEnglish)
          }
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
        <ProjectDeleteModal />
      </ProjectStoreProvider>
    </div>
  )
}
