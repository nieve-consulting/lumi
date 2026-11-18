"use client"

import Image from "next/image"
import type { TeamMember } from "@/generated/graphql"
import { ColumnDef } from "@tanstack/react-table"
import { User } from "lucide-react"

import type { DataTableFeatures } from "@/lib/dataTable"
import { selectionColumn } from "@/app/admin/components/selectionColumn"
import { DataTableColumnHeader } from "@/app/admin/components/table/DataTableColumnHeader"
import { nestedNeedingReview, recordTranslationStatus, withLanguageParam } from "@/app/admin/components/translations/languages"
import { translationColumns } from "@/app/admin/components/translations/translationColumns"

import { DataTableRowActions } from "./DataTableRowActions"

export const columns: ColumnDef<DataTableFeatures, TeamMember>[] = [
  selectionColumn<TeamMember>((teamMember) => teamMember.name),
  {
    accessorKey: "profile_photo_key",
    header: () => "",
    cell: ({ row }) => {
      const key = row.getValue("profile_photo_key")

      return (
        <>
          {key ? (
            <Image src={`/media/${key}?w=60&h=60`} alt={row.getValue("name")} width={30} height={30} className="rounded-full" />
          ) : (
            <div className="inline-block rounded-full bg-slate-200 p-1">
              <User size={22} />
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
    accessorKey: "job_title",
    header: ({ column }) => <DataTableColumnHeader column={column} title="Job Title" />,
    cell: ({ row }) => {
      return (
        <div className="flex space-x-2">
          <span className="max-w-[500px] truncate font-medium">{row.getValue("job_title")}</span>
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
  ...translationColumns<TeamMember>({
    getHref: (teamMember, language) => withLanguageParam(`/admin/team-members/edit/${teamMember.id}`, language),
    // Experiences missing, drafts or outdated in the language make the team member need reviewing there too
    getStatus: (teamMember, language) =>
      recordTranslationStatus(teamMember.translations, language, nestedNeedingReview(teamMember.experiences, language)),
  }),
  {
    id: "actions",
    cell: ({ row }) => <DataTableRowActions row={row} />,
  },
]
