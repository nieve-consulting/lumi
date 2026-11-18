"use client"

import Image from "next/image"
import { Project } from "@/generated/graphql"
import { Column, ColumnDef } from "@tanstack/react-table"
import { ImageOff } from "lucide-react"
import { DateTime } from "luxon"

import type { DataTableFeatures } from "@/lib/dataTable"
import { selectionColumn } from "@/app/admin/components/selectionColumn"
import { useSourceLabels } from "@/app/admin/components/SourceLabelsProvider"
import { DataTableColumnHeader } from "@/app/admin/components/table/DataTableColumnHeader"
import { nestedNeedingReview, recordTranslationStatus, withLanguageParam } from "@/app/admin/components/translations/languages"
import { translationColumns } from "@/app/admin/components/translations/translationColumns"

import { contributionHasEnglish } from "../form/schema"
import { DataTableRowActions } from "./DataTableRowActions"

// The client column, named by the installation's label
function ClientHeader({ column }: { column: Column<DataTableFeatures, Project, unknown> }) {
  return <DataTableColumnHeader column={column} title={useSourceLabels().clients.singular} />
}

// The list's columns. While team members are off, their hidden contributions don't count towards a translation's status
export const projectColumns = (showsTeamMembers: boolean): ColumnDef<DataTableFeatures, Project>[] => [
  selectionColumn<Project>((project) => project.name),
  {
    accessorKey: "image_key",
    header: () => "",
    cell: ({ row }) => {
      const key = row.getValue("image_key")

      return (
        <>
          {key ? (
            <Image
              src={`/media/${key}?w=100&h=60`}
              alt={row.getValue("name")}
              width={50}
              height={30}
              className="aspect-video rounded-md object-cover"
            />
          ) : (
            <div className="inline-block aspect-video h-[30px] rounded-md bg-slate-200 p-1 text-center">
              <ImageOff size={20} className="inline" />
            </div>
          )}
        </>
      )
    },
  },
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
    accessorKey: "clientName",
    header: ({ column }) => <ClientHeader column={column} />,
    cell: ({ row }) => {
      return (
        <div className="flex space-x-2">
          <span className="max-w-[500px] truncate font-medium">{row.getValue("clientName")}</span>
        </div>
      )
    },
  },
  {
    accessorKey: "start_date",
    header: ({ column }) => <DataTableColumnHeader column={column} title="Start Date" />,
    cell: ({ row }) => {
      return (
        <div className="flex space-x-2">
          <span className="max-w-[500px] truncate font-medium">{DateTime.fromISO(row.getValue("start_date")).toFormat("MMM, yyyy")}</span>
        </div>
      )
    },
  },
  {
    accessorKey: "end_date",
    header: ({ column }) => <DataTableColumnHeader column={column} title="End Date" />,
    cell: ({ row }) => {
      return (
        <div className="flex space-x-2">
          <span className="max-w-[500px] truncate font-medium">
            {row.getValue("end_date") ? DateTime.fromISO(row.getValue("end_date")).toFormat("MMM, yyyy") : "Active"}
          </span>
        </div>
      )
    },
  },
  {
    accessorKey: "published",
    header: ({ column }) => <DataTableColumnHeader column={column} title="Published" />,
    cell: ({ row }) => {
      return (
        <div className="flex space-x-2">
          <span className="max-w-[100px] truncate font-medium">{row.getValue("published") ? "Published" : "Private"}</span>
        </div>
      )
    },
  },
  ...translationColumns<Project>({
    getHref: (project, language) => withLanguageParam(`/admin/projects/edit/${project.id}`, language),
    // Contributions missing, drafts or outdated in the language make the project need reviewing there too
    getStatus: (project, language) =>
      recordTranslationStatus(
        project.translations,
        language,
        nestedNeedingReview(showsTeamMembers ? project.teamMembers : [], language, contributionHasEnglish)
      ),
  }),
  {
    id: "actions",
    cell: ({ row }) => <DataTableRowActions row={row} />,
  },
]
