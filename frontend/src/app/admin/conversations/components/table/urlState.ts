import type { ColumnFiltersState, PaginationState, SortingState } from "@tanstack/react-table"
import { DateTime } from "luxon"

import type { ConversationStatus, StartedRange } from "./filters"

export const pageSizes = [10, 20, 30, 40, 50]
const defaultPageSize = pageSizes[0]

const sortableColumns = ["createdAt", "topic", "name", "email", "phone", "cost", "closed"]
export const defaultSorting: SortingState = [{ id: "createdAt", desc: true }]

export const conversationListPath = "/admin/conversations"

// Remembers the list query so links back to the list from a conversation keep the search and filters
const listQueryKey = "conversations:listQuery"

export type ConversationListState = {
  globalFilter: string
  columnFilters: ColumnFiltersState
  sorting: SortingState
  pagination: PaginationState
}

const parseStatus = (value: string | null): ConversationStatus | undefined => (value === "open" || value === "closed" ? value : undefined)

const parseDay = (value: string | null) => (value && /^\d{4}-\d{2}-\d{2}$/.test(value) && DateTime.fromISO(value).isValid ? value : undefined)

// "cost" sorts ascending and "-cost" descending
const parseSorting = (value: string | null): SortingState => {
  const id = value?.replace(/^-/, "")
  return value && id && sortableColumns.includes(id) ? [{ id, desc: value.startsWith("-") }] : defaultSorting
}

const parsePositiveInt = (value: string | null) => {
  const number = Number(value)
  return Number.isInteger(number) && number > 0 ? number : undefined
}

// Reads the list state from the query string, ignoring values that are missing or invalid
export function parseListState(params: URLSearchParams): ConversationListState {
  const status = parseStatus(params.get("status"))
  const started: StartedRange = { from: parseDay(params.get("from")), to: parseDay(params.get("to")) }
  const size = parsePositiveInt(params.get("size"))

  const columnFilters: ColumnFiltersState = []
  if (status) columnFilters.push({ id: "closed", value: status })
  if (started.from || started.to) columnFilters.push({ id: "createdAt", value: started })

  return {
    globalFilter: params.get("q") ?? "",
    columnFilters,
    sorting: parseSorting(params.get("sort")),
    pagination: {
      pageIndex: (parsePositiveInt(params.get("page")) ?? 1) - 1,
      pageSize: size && pageSizes.includes(size) ? size : defaultPageSize,
    },
  }
}

// Writes the list state to a query string, leaving defaults out to keep links short
export function serializeListState({ globalFilter, columnFilters, sorting, pagination }: ConversationListState) {
  const params = new URLSearchParams()
  const status = columnFilters.find((filter) => filter.id === "closed")?.value as ConversationStatus | undefined
  const started = columnFilters.find((filter) => filter.id === "createdAt")?.value as StartedRange | undefined

  const [sort] = sorting

  if (globalFilter.trim()) params.set("q", globalFilter.trim())
  if (status) params.set("status", status)
  if (started?.from) params.set("from", started.from)
  if (started?.to) params.set("to", started.to)
  if (sort && (sort.id !== defaultSorting[0].id || sort.desc !== defaultSorting[0].desc)) params.set("sort", `${sort.desc ? "-" : ""}${sort.id}`)
  if (pagination.pageIndex > 0) params.set("page", String(pagination.pageIndex + 1))
  if (pagination.pageSize !== defaultPageSize) params.set("size", String(pagination.pageSize))

  return params.toString()
}

// Storage can be unavailable, e.g. in private windows, so the list link then falls back to the unfiltered list
export function saveListQuery(query: string) {
  try {
    sessionStorage.setItem(listQueryKey, query)
  } catch {}
}

export function conversationListHref() {
  try {
    const query = sessionStorage.getItem(listQueryKey)
    return query ? `${conversationListPath}?${query}` : conversationListPath
  } catch {
    return conversationListPath
  }
}
