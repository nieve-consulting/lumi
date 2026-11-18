import Link from "next/link"
import { Project } from "@/generated/graphql"
import { Row } from "@tanstack/react-table"
import { EllipsisIcon } from "lucide-react"

import type { DataTableFeatures } from "@/lib/dataTable"
import { Button } from "@/components/ui/button"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"

import { useProjectStore } from "./storeProvider"

interface DataTableRowActionsProps {
  row: Row<DataTableFeatures, Project>
}

export function DataTableRowActions({ row }: DataTableRowActionsProps) {
  const project = row.original
  const { setItemToDelete } = useProjectStore((state) => state)

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" className="data-[state=open]:bg-muted flex h-8 w-8 p-0">
          <EllipsisIcon className="h-4 w-4" />
          <span className="sr-only">Open menu</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-[160px]">
        <DropdownMenuItem asChild>
          <Link href={`/admin/projects/edit/${project.id}`}>Edit</Link>
        </DropdownMenuItem>
        <DropdownMenuItem
          className="text-destructive"
          onClick={(e) => {
            e.stopPropagation()
            setItemToDelete(project)
          }}
        >
          Delete
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
