"use client"

import type { Website } from "@/generated/graphql"
import { ColumnDef } from "@tanstack/react-table"

import type { DataTableFeatures } from "@/lib/dataTable"
import { DataTableColumnHeader } from "@/app/admin/components/table/DataTableColumnHeader"

import { formatDateTime } from "../../../components/dashboard/format"
import CrawlStatus from "./CrawlStatus"
import { DataTableRowActions } from "./DataTableRowActions"

// Dates are shown in the company time zone: the table renders on the server, whose time zone is not the admin's
export const getColumns = (timeZone: string): ColumnDef<DataTableFeatures, Website>[] => [
  {
    accessorKey: "name",
    header: ({ column }) => <DataTableColumnHeader column={column} title="Name" />,
    cell: ({ row }) => {
      return (
        <div className="flex space-x-2">
          <span className="max-w-[500px] truncate font-medium">{row.getValue("name")}</span>
        </div>
      )
    },
  },
  {
    accessorKey: "url",
    header: ({ column }) => <DataTableColumnHeader column={column} title="URL" />,
    cell: ({ row }) => {
      return (
        <div className="flex space-x-2">
          <span className="max-w-[500px] truncate font-medium">{row.getValue("url")}</span>
        </div>
      )
    },
  },
  {
    accessorKey: "last_processed",
    header: ({ column }) => <DataTableColumnHeader column={column} title="Last Processed" />,
    cell: ({ row }) => {
      return (
        <div className="flex space-x-2">
          <span className="max-w-[500px] truncate font-medium">
            {row.getValue("last_processed") ? formatDateTime(row.getValue("last_processed"), timeZone) : "Never"}
          </span>
        </div>
      )
    },
  },
  {
    id: "crawl",
    header: ({ column }) => <DataTableColumnHeader column={column} title="Status" />,
    cell: ({ row }) => <CrawlStatus websiteId={row.original.id} crawl={row.original.latestCrawl} timeZone={timeZone} />,
  },
  {
    id: "actions",
    cell: ({ row }) => <DataTableRowActions row={row} />,
  },
]
