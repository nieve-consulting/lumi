"use client"

import { useMemo, useState } from "react"
import type { Website } from "@/generated/graphql"
import { ColumnFiltersState, ColumnVisibilityState, flexRender, SortingState, useTable } from "@tanstack/react-table"
import { useRouter } from "nextjs-toploader/app"

import { dataTableFeatures } from "@/lib/dataTable"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { DataTablePagination } from "@/app/admin/components/table/DataTablePagination"

import WebsiteDeleteModal from "../WebsiteDeleteModal"
import { getColumns } from "./Columns"
import { WebsiteStoreProvider } from "./storeProvider"

interface DataTableProps {
  data: Website[]
  // The company time zone, which the table's dates are shown in
  timeZone: string
}

export function DataTable({ data, timeZone }: DataTableProps) {
  const columns = useMemo(() => getColumns(timeZone), [timeZone])
  const [rowSelection, setRowSelection] = useState({})
  const [columnVisibility, setColumnVisibility] = useState<ColumnVisibilityState>({})
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([])
  const [sorting, setSorting] = useState<SortingState>([])
  const router = useRouter()

  const handleRowClick = (id: string) => {
    router.push(`/admin/websites/edit/${id}`)
  }

  const table = useTable({
    features: dataTableFeatures,
    data,
    columns,
    // Rows keep their state, such as an open menu, as the page refreshes during a crawl
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
      <WebsiteStoreProvider>
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
                    No websites.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
        <DataTablePagination table={table} />
        <WebsiteDeleteModal />
      </WebsiteStoreProvider>
    </div>
  )
}
