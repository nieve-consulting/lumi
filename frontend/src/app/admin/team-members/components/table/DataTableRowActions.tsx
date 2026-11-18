import Link from "next/link"
import { TeamMember } from "@/generated/graphql"
import { teamMemberResumePath } from "@lumi/shared-contracts/resume"
import { Row } from "@tanstack/react-table"
import { EllipsisIcon } from "lucide-react"

import type { DataTableFeatures } from "@/lib/dataTable"
import { Button } from "@/components/ui/button"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"

import { useResumes } from "./resumesContext"
import { useTeamMemberStore } from "./storeProvider"

interface DataTableRowActionsProps {
  row: Row<DataTableFeatures, TeamMember>
}

export function DataTableRowActions({ row }: DataTableRowActionsProps) {
  const teamMember = row.original
  const { setItemToDelete } = useTeamMemberStore((state) => state)
  const resumes = useResumes()

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
          <Link href={`/admin/team-members/edit/${teamMember.id}`}>Edit</Link>
        </DropdownMenuItem>
        {resumes && (
          <DropdownMenuItem asChild>
            <Link href={teamMemberResumePath(teamMember.id)} target="_blank" onClick={(e) => e.stopPropagation()}>
              Download Resume
            </Link>
          </DropdownMenuItem>
        )}
        <DropdownMenuItem
          className="text-destructive"
          onClick={(e) => {
            e.stopPropagation()
            setItemToDelete(teamMember)
          }}
        >
          Delete
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
