import { Capability } from "@/generated/graphql"
import { Row } from "@tanstack/react-table"
import { Trash } from "lucide-react"

import type { DataTableFeatures } from "@/lib/dataTable"

import { useCapabilityStore } from "../../storeProvider"

interface DataTableRowActionsProps {
  row: Row<DataTableFeatures, Capability>
}

export function DataTableRowActions({ row }: DataTableRowActionsProps) {
  const capability = row.original
  const { setItemToDelete } = useCapabilityStore((state) => state)

  return (
    <div className="text-right">
      <Trash
        className="text-destructive inline-block size-4 cursor-pointer"
        onClick={(e) => {
          e.stopPropagation()
          setItemToDelete(capability)
        }}
      />
    </div>
  )
}
