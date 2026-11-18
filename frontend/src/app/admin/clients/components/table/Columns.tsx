"use client"

import Image from "next/image"
import { Client } from "@/generated/graphql"
import { ColumnDef } from "@tanstack/react-table"
import { Building } from "lucide-react"

import type { DataTableFeatures } from "@/lib/dataTable"
import { selectionColumn } from "@/app/admin/components/selectionColumn"
import { DataTableColumnHeader } from "@/app/admin/components/table/DataTableColumnHeader"
import { withLanguageParam } from "@/app/admin/components/translations/languages"
import { translationColumns } from "@/app/admin/components/translations/translationColumns"

import { DataTableRowActions } from "./DataTableRowActions"

export const columns: ColumnDef<DataTableFeatures, Client>[] = [
  selectionColumn<Client>((client) => client.name),
  {
    accessorKey: "logo_key",
    header: () => "",
    cell: ({ row }) => {
      const key = row.getValue("logo_key")

      return (
        <>
          {key ? (
            <Image src={`/media/${row.getValue("logo_key")}?w=60&h=60`} alt={row.getValue("name")} width={30} height={30} className="rounded-full" />
          ) : (
            <div className="inline-block rounded-full bg-slate-200 p-1">
              <Building size={22} />
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
  ...translationColumns<Client>({ getHref: (client, language) => withLanguageParam(`/admin/clients/edit/${client.id}`, language) }),
  {
    id: "actions",
    cell: ({ row }) => <DataTableRowActions row={row} />,
  },
]
