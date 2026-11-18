import {
  columnFilteringFeature,
  columnVisibilityFeature,
  constructFilterFn,
  createFilteredRowModel,
  createPaginatedRowModel,
  createSortedRowModel,
  filterFns,
  globalFilteringFeature,
  rowPaginationFeature,
  rowSelectionFeature,
  rowSortingFeature,
  sortFns,
  tableFeatures,
} from "@tanstack/react-table"

// Features shared by the admin data tables (TanStack Table v9 requires opting into each one)
export const dataTableFeatures = tableFeatures({
  columnFilteringFeature,
  columnVisibilityFeature,
  globalFilteringFeature,
  rowPaginationFeature,
  rowSelectionFeature,
  rowSortingFeature,
  filteredRowModel: createFilteredRowModel(),
  paginatedRowModel: createPaginatedRowModel(),
  sortedRowModel: createSortedRowModel(),
  filterFns,
  sortFns,
})

export type DataTableFeatures = typeof dataTableFeatures

// Case- and accent-insensitive, so "malaga" finds "Málaga"
const normalize = (value: unknown) =>
  value == null
    ? undefined
    : String(value)
        .normalize("NFD")
        .replace(/\p{Diacritic}/gu, "")
        .toLowerCase()
        .trim()

// The global search of the admin data tables: rows whose searchable columns contain the text, ignoring case and accents
export const searchFilterFn = constructFilterFn({
  filter: (dataValue?: string, filterValue?: string) => !filterValue || Boolean(dataValue?.includes(filterValue)),
  resolveFilterValue: normalize,
  resolveDataValue: normalize,
})
