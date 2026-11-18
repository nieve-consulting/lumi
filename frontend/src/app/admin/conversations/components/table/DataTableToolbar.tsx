import type { RefObject } from "react"
import type { Thread } from "@/generated/graphql"
import type { ReactTable } from "@tanstack/react-table"
import { XIcon } from "lucide-react"

import type { DataTableFeatures } from "@/lib/dataTable"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"

import type { ConversationStatus, StartedRange } from "./filters"

interface DataTableToolbarProps {
  table: ReactTable<DataTableFeatures, Thread>
  searchRef: RefObject<HTMLInputElement | null>
  isFiltered: boolean
  onClear: () => void
}

export function DataTableToolbar({ table, searchRef, isFiltered, onClear }: DataTableToolbarProps) {
  const statusColumn = table.getColumn("closed")
  const startedColumn = table.getColumn("createdAt")

  const status = (statusColumn?.getFilterValue() as ConversationStatus | undefined) ?? "all"
  const started = (startedColumn?.getFilterValue() as StartedRange | undefined) ?? {}

  const setStarted = (range: StartedRange) => startedColumn?.setFilterValue({ ...started, ...range })

  return (
    <div role="search" aria-label="Conversations" className="flex flex-wrap items-end gap-3">
      <div className="grid w-full gap-1.5 sm:min-w-64 sm:flex-1">
        <Label htmlFor="conversation-search">Search</Label>
        <Input
          ref={searchRef}
          id="conversation-search"
          type="search"
          placeholder="Name, email or topic"
          value={(table.state.globalFilter as string | undefined) ?? ""}
          onChange={(e) => table.setGlobalFilter(e.target.value)}
        />
      </div>
      <div className="grid w-full gap-1.5 sm:w-36">
        <Label htmlFor="conversation-status">Status</Label>
        <Select value={status} onValueChange={(value) => statusColumn?.setFilterValue(value === "all" ? undefined : value)}>
          <SelectTrigger id="conversation-status">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All</SelectItem>
            <SelectItem value="open">Open</SelectItem>
            <SelectItem value="closed">Closed</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div className="grid w-full grid-cols-2 gap-3 sm:w-auto">
        <div className="grid min-w-0 gap-1.5">
          <Label htmlFor="conversation-started-from">Started from</Label>
          <Input
            id="conversation-started-from"
            type="date"
            className="min-w-0 sm:w-40"
            max={started.to}
            value={started.from ?? ""}
            onChange={(e) => setStarted({ from: e.target.value || undefined })}
          />
        </div>
        <div className="grid min-w-0 gap-1.5">
          <Label htmlFor="conversation-started-to">Started to</Label>
          <Input
            id="conversation-started-to"
            type="date"
            className="min-w-0 sm:w-40"
            min={started.from}
            value={started.to ?? ""}
            onChange={(e) => setStarted({ to: e.target.value || undefined })}
          />
        </div>
      </div>
      {isFiltered && (
        <Button variant="ghost" onClick={onClear}>
          <XIcon />
          Clear search and filters
        </Button>
      )}
    </div>
  )
}
