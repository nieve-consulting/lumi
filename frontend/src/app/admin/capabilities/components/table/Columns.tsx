"use client"

import { Capability } from "@/generated/graphql"
import { ColumnDef } from "@tanstack/react-table"

import type { DataTableFeatures } from "@/lib/dataTable"
import { selectionColumn } from "@/app/admin/components/selectionColumn"
import { DataTableColumnHeader } from "@/app/admin/components/table/DataTableColumnHeader"
import type { Language } from "@/app/admin/components/translations/languages"
import { translationColumns } from "@/app/admin/components/translations/translationColumns"

import { DataTableRowActions } from "./DataTableRowActions"

// The list's columns. Capabilities are edited in a modal, which a translation status opens in that language
export const capabilityColumns = (onEdit: (capability: Capability, language: Language) => void): ColumnDef<DataTableFeatures, Capability>[] => [
  selectionColumn<Capability>((capability) => capability.name),
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
  ...translationColumns<Capability>({ onSelect: onEdit }),
  {
    id: "actions",
    cell: ({ row }) => <DataTableRowActions row={row} />,
  },
]
