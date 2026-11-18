import Link from "next/link"
import type { JobOpening } from "@/generated/graphql"
import { Row } from "@tanstack/react-table"
import { EllipsisIcon } from "lucide-react"

import type { DataTableFeatures } from "@/lib/dataTable"
import { Button } from "@/components/ui/button"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"

import { useJobOpeningStore } from "./storeProvider"

interface DataTableRowActionsProps {
  row: Row<DataTableFeatures, JobOpening>
}

export function DataTableRowActions({ row }: DataTableRowActionsProps) {
  const jobOpening = row.original
  const { setItemToDelete } = useJobOpeningStore((state) => state)

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" className="data-[state=open]:bg-muted flex h-8 w-8 p-0" onClick={(e) => e.stopPropagation()}>
          <EllipsisIcon className="h-4 w-4" />
          <span className="sr-only">Actions for {jobOpening.title}</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-[160px]" onClick={(e) => e.stopPropagation()}>
        <DropdownMenuItem asChild>
          <Link href={`/admin/job-openings/edit/${jobOpening.id}`}>Edit</Link>
        </DropdownMenuItem>
        <DropdownMenuItem className="text-destructive" onClick={() => setItemToDelete(jobOpening)}>
          Delete
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
