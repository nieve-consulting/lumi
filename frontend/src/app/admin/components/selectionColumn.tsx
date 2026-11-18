"use client"

import type { ColumnDef, RowData } from "@tanstack/react-table"

import type { DataTableFeatures } from "@/lib/dataTable"
import { Checkbox } from "@/components/ui/checkbox"

// A records list's first column, selecting rows with checkboxes, e.g. to translate them in bulk; the header's selects the
// page's rows. Rows open their record when clicked, so a click on a checkbox or around it only selects. `name` labels each
// row's checkbox
export function selectionColumn<TData extends RowData>(name: (row: TData) => string): ColumnDef<DataTableFeatures, TData> {
  return {
    id: "select",
    enableSorting: false,
    header: ({ table }) => (
      <Checkbox
        checked={table.getIsAllPageRowsSelected()}
        indeterminate={table.getIsSomePageRowsSelected() && !table.getIsAllPageRowsSelected()}
        onChange={(e) => table.toggleAllPageRowsSelected(e.target.checked)}
        aria-label="Select all on this page"
      />
    ),
    cell: ({ row }) => (
      // The label widens the click target to the cell's padding
      <label className="-m-2 flex cursor-pointer p-2" onClick={(e) => e.stopPropagation()}>
        <Checkbox
          checked={row.getIsSelected()}
          disabled={!row.getCanSelect()}
          onChange={(e) => row.toggleSelected(e.target.checked)}
          aria-label={`Select ${name(row.original)}`}
        />
      </label>
    ),
  }
}
