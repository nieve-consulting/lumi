import Link from "next/link"
import { Website } from "@/generated/graphql"
import { Row } from "@tanstack/react-table"
import { Pencil, Trash2 } from "lucide-react"

import type { DataTableFeatures } from "@/lib/dataTable"
import { DropdownMenuItem } from "@/components/ui/dropdown-menu"

import WebsiteMenu from "../WebsiteMenu"
import { useWebsiteStore } from "./storeProvider"

interface DataTableRowActionsProps {
  row: Row<DataTableFeatures, Website>
}

export function DataTableRowActions({ row }: DataTableRowActionsProps) {
  const website = row.original
  const { setItemToDelete } = useWebsiteStore((state) => state)

  return (
    // Clicking the row opens the website, so clicks in the menu and its dialogs, which React passes up through the portal,
    // stop here
    <div onClick={(e) => e.stopPropagation()}>
      <WebsiteMenu websiteId={website.id} crawl={website.latestCrawl} compact>
        <DropdownMenuItem asChild>
          <Link href={`/admin/websites/edit/${website.id}`}>
            <Pencil size={15} className="mr-2" /> Edit
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem className="text-destructive" onClick={() => setItemToDelete(website)}>
          <Trash2 size={15} className="mr-2" /> Delete
        </DropdownMenuItem>
      </WebsiteMenu>
    </div>
  )
}
