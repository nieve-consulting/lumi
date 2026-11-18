"use client"

import { Thread } from "@/generated/graphql"
import { ColumnDef } from "@tanstack/react-table"
import { MessageCircle, MessageCircleOff } from "lucide-react"

import type { DataTableFeatures } from "@/lib/dataTable"
import { formatCost } from "@/lib/utils"
import { DataTableColumnHeader } from "@/app/admin/components/table/DataTableColumnHeader"

import { formatDateTime } from "../../../components/dashboard/format"
import { DataTableRowActions } from "./DataTableRowActions"
import { startedFilterFn, statusFilterFn } from "./filters"

// Start times show and filter in the company's time zone, as on the dashboard
export const getColumns = (timeZone: string): ColumnDef<DataTableFeatures, Thread>[] => [
  {
    accessorKey: "createdAt",
    filterFn: startedFilterFn(timeZone),
    header: ({ column }) => <DataTableColumnHeader column={column} title="Started" />,
    cell: ({ row }) => {
      return (
        <div className="flex space-x-2">
          <span className="max-w-[500px] truncate font-medium">{formatDateTime(row.getValue("createdAt"), timeZone)}</span>
        </div>
      )
    },
  },
  {
    id: "topic",
    // Search and sort by what the list shows, so "ongoing" finds conversations without a topic yet
    accessorFn: (thread) => thread.topic || "Ongoing chat",
    header: ({ column }) => <DataTableColumnHeader column={column} title="Topic" />,
    cell: ({ row }) => {
      return (
        <div className="flex items-center gap-2">
          <span className="max-w-[500px] truncate font-medium">{row.original.topic || <i>Ongoing chat</i>}</span>
          {/* A partial or failed enquiry the team must retry or follow up */}
          {row.original.enquiryFailed && (
            <span className="shrink-0 rounded-full bg-red-100 px-2 py-0.5 text-xs font-semibold whitespace-nowrap text-red-800">
              Enquiry not delivered
            </span>
          )}
        </div>
      )
    },
  },
  {
    accessorKey: "name",
    header: ({ column }) => <DataTableColumnHeader column={column} title="Name" />,
    cell: ({ row }) => {
      return <div className="flex space-x-2">{row.getValue("name") || "--"}</div>
    },
  },
  {
    accessorKey: "email",
    header: ({ column }) => <DataTableColumnHeader column={column} title="Email" />,
    cell: ({ row }) => {
      return <div className="flex space-x-2">{row.getValue("email") || "--"}</div>
    },
  },
  {
    accessorKey: "phone",
    header: ({ column }) => <DataTableColumnHeader column={column} title="Phone" />,
    cell: ({ row }) => {
      return <div className="flex space-x-2">{row.getValue("phone") || "--"}</div>
    },
  },
  {
    id: "cost",
    // Conversations without recorded usage or with unpriced model calls have an unknown cost, sorted after the known ones
    accessorFn: (thread) => thread.cost ?? undefined,
    sortUndefined: "last",
    header: ({ column }) => <DataTableColumnHeader column={column} title="Cost" />,
    cell: ({ row }) => {
      const cost = row.getValue<number | undefined>("cost")
      return <div className="flex space-x-2 tabular-nums">{cost === undefined ? "--" : formatCost(cost)}</div>
    },
  },
  {
    accessorKey: "closed",
    filterFn: statusFilterFn,
    header: ({ column }) => <DataTableColumnHeader column={column} title="Closed" className="w-2" />,
    cell: ({ row }) => {
      return (
        <div className="flex space-x-2">
          {row.getValue("closed") ? <MessageCircleOff className="text-destructive size-4" /> : <MessageCircle className="size-4 text-green-500" />}
        </div>
      )
    },
  },
  { id: "actions", cell: ({ row }) => <DataTableRowActions row={row} /> },
]
