import type { Capability } from "@/generated/graphql"
import { flexRender, type Row } from "@tanstack/react-table"

import type { DataTableFeatures } from "@/lib/dataTable"
import { TableCell, TableRow } from "@/components/ui/table"

import { useCapabilityStore } from "../../storeProvider"

interface IProps {
  row: Row<DataTableFeatures, Capability>
}

export default function DataTableRow({ row }: IProps) {
  const { setItemForForm } = useCapabilityStore((state) => state)

  return (
    <TableRow key={row.id} className="cursor-pointer" data-state={row.getIsSelected() && "selected"} onClick={() => setItemForForm(row.original)}>
      {row.getVisibleCells().map((cell) => (
        <TableCell key={cell.id}>{flexRender(cell.column.columnDef.cell, cell.getContext())}</TableCell>
      ))}
    </TableRow>
  )
}
