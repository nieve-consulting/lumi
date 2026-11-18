"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { useSearchParams } from "next/navigation"
import type { Thread } from "@/generated/graphql"
import { ColumnFiltersState, flexRender, PaginationState, SortingState, useTable } from "@tanstack/react-table"
import { useRouter } from "nextjs-toploader/app"

import { dataTableFeatures, searchFilterFn } from "@/lib/dataTable"
import { Button } from "@/components/ui/button"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"

import ThreadDeleteModal from "../ThreadDeleteModal"
import { getColumns } from "./Columns"
import { DataTablePagination } from "./DataTablePagination"
import { DataTableToolbar } from "./DataTableToolbar"
import { searchableColumns } from "./filters"
import { ThreadStoreProvider } from "./storeProvider"
import { conversationListPath, parseListState, saveListQuery, serializeListState } from "./urlState"

interface DataTableProps {
  data: Thread[]
  // The company's time zone, in which conversations start
  timeZone: string
}

export function DataTable({ data, timeZone }: DataTableProps) {
  const columns = useMemo(() => getColumns(timeZone), [timeZone])
  const searchParams = useSearchParams()
  // Search, filters and page start from the URL, so they survive opening a conversation and coming back
  const [initialState] = useState(() => parseListState(searchParams))
  const [rowSelection, setRowSelection] = useState({})
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>(initialState.columnFilters)
  const [globalFilter, setGlobalFilter] = useState(initialState.globalFilter)
  const [pagination, setPagination] = useState<PaginationState>(initialState.pagination)
  const [sorting, setSorting] = useState<SortingState>(initialState.sorting)
  const [seenUrlQuery, setSeenUrlQuery] = useState(() => searchParams.toString())
  const searchRef = useRef<HTMLInputElement>(null)
  const router = useRouter()

  // Next.js keeps the list mounted when only its query changes, e.g. through the sidebar link. The list's own saves
  // come back matching its state; any other query is a navigation, whose search and filters the list then shows
  const urlQuery = searchParams.toString()
  if (urlQuery !== seenUrlQuery) {
    setSeenUrlQuery(urlQuery)
    if (urlQuery !== serializeListState({ globalFilter, columnFilters, sorting, pagination })) {
      const urlState = parseListState(searchParams)
      setColumnFilters(urlState.columnFilters)
      setGlobalFilter(urlState.globalFilter)
      setPagination(urlState.pagination)
      setSorting(urlState.sorting)
    }
  }

  const resetPage = () => setPagination((current) => ({ ...current, pageIndex: 0 }))

  const table = useTable({
    features: dataTableFeatures,
    data,
    columns,
    state: { sorting, rowSelection, columnFilters, globalFilter, pagination },
    enableRowSelection: true,
    globalFilterFn: searchFilterFn,
    getColumnCanGlobalFilter: (column) => searchableColumns.includes(column.id),
    // Only changes to what is listed go back to the first page; refreshed data after a delete keeps the current one
    autoResetPageIndex: false,
    onRowSelectionChange: setRowSelection,
    onSortingChange: (updater) => {
      setSorting(updater)
      resetPage()
    },
    onColumnFiltersChange: (updater) => {
      setColumnFilters(updater)
      resetPage()
    },
    onGlobalFilterChange: (updater) => {
      setGlobalFilter(updater)
      resetPage()
    },
    onPaginationChange: setPagination,
  })

  // Replacing the history entry updates the URL without a server round trip or one Back step per keystroke. Saved on
  // every change rather than debounced, so it is never left pending while the team member navigates away
  useEffect(() => {
    const query = serializeListState({ globalFilter, columnFilters, sorting, pagination })
    saveListQuery(query)
    if (query !== window.location.search.replace(/^\?/, "")) {
      window.history.replaceState(null, "", query ? `${conversationListPath}?${query}` : conversationListPath)
    }
  }, [globalFilter, columnFilters, sorting, pagination])

  const handleRowClick = (id: string) => {
    router.push(`/admin/conversations/${id}`)
  }

  // A page from an old link may no longer exist, e.g. after conversations were deleted
  const lastPageIndex = Math.max(table.getPageCount() - 1, 0)
  if (pagination.pageIndex > lastPageIndex) setPagination({ ...pagination, pageIndex: lastPageIndex })

  const rows = table.getRowModel().rows
  const isFiltered = columnFilters.length > 0 || globalFilter.trim() !== ""

  const clearFilters = () => {
    setColumnFilters([])
    setGlobalFilter("")
    resetPage()
    // The clear buttons disappear once used, so keep keyboard focus where the next search starts
    searchRef.current?.focus()
  }

  return (
    <div className="space-y-4">
      {data.length > 0 && <DataTableToolbar table={table} searchRef={searchRef} isFiltered={isFiltered} onClear={clearFilters} />}
      <ThreadStoreProvider>
        {rows.length ? (
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
                {rows.map((row) => (
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
                ))}
              </TableBody>
            </Table>
          </div>
        ) : (
          // Outside the table so the message stays in view when its columns scroll at narrow widths
          <div className="flex min-h-24 flex-col items-center justify-center gap-2 rounded-md border p-4 text-center text-sm">
            {data.length ? (
              <>
                <p className="text-muted-foreground">No matching conversations.</p>
                <Button variant="outline" size="sm" onClick={clearFilters}>
                  Clear search and filters
                </Button>
              </>
            ) : (
              <p className="text-muted-foreground">No conversations yet.</p>
            )}
          </div>
        )}
        <DataTablePagination table={table} />
        <ThreadDeleteModal />
      </ThreadStoreProvider>
    </div>
  )
}
