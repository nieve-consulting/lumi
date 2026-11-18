"use client"

import type { JobOpening } from "@/generated/graphql"
import { JOB_WORK_MODE_LABELS, type JobWorkMode } from "@lumi/shared-contracts/knowledge"
import { ColumnDef } from "@tanstack/react-table"
import { DateTime } from "luxon"

import type { DataTableFeatures } from "@/lib/dataTable"
import { selectionColumn } from "@/app/admin/components/selectionColumn"
import { DataTableColumnHeader } from "@/app/admin/components/table/DataTableColumnHeader"
import { withLanguageParam } from "@/app/admin/components/translations/languages"
import { translationColumns } from "@/app/admin/components/translations/translationColumns"

import { DataTableRowActions } from "./DataTableRowActions"

// A posted date as the admin shows it, e.g. 9 Nov 2026
const formatPostedAt = (postedAt: string) => {
  const date = DateTime.fromISO(postedAt, { setZone: true })
  return date.isValid ? date.setLocale("en").toFormat("d LLL yyyy") : postedAt
}

export const columns: ColumnDef<DataTableFeatures, JobOpening>[] = [
  selectionColumn<JobOpening>((jobOpening) => jobOpening.title),
  {
    accessorKey: "title",
    header: ({ column }) => <DataTableColumnHeader column={column} title="Title" />,
    cell: ({ row }) => <span className="block max-w-[400px] truncate font-medium">{row.original.title}</span>,
  },
  {
    accessorKey: "location",
    header: ({ column }) => <DataTableColumnHeader column={column} title="Location" />,
    cell: ({ row }) => <span className="block max-w-[200px] truncate">{row.original.location}</span>,
  },
  {
    accessorKey: "work_mode",
    header: ({ column }) => <DataTableColumnHeader column={column} title="Work mode" />,
    cell: ({ row }) => JOB_WORK_MODE_LABELS[row.original.work_mode as JobWorkMode] ?? row.original.work_mode,
  },
  {
    accessorKey: "posted_at",
    header: ({ column }) => <DataTableColumnHeader column={column} title="Posted" />,
    cell: ({ row }) => <span className="whitespace-nowrap">{formatPostedAt(row.original.posted_at)}</span>,
  },
  {
    accessorKey: "published",
    header: ({ column }) => <DataTableColumnHeader column={column} title="Published" />,
    cell: ({ row }) => (row.original.published ? "Published" : "Private"),
  },
  ...translationColumns<JobOpening>({ getHref: (jobOpening, language) => withLanguageParam(`/admin/job-openings/edit/${jobOpening.id}`, language) }),
  {
    id: "actions",
    cell: ({ row }) => <DataTableRowActions row={row} />,
  },
]
