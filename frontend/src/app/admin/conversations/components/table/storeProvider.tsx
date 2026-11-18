"use client"

import type { Thread } from "@/generated/graphql"

import { createDeleteStore } from "@/app/admin/components/table/deleteStore"

export const { Provider: ThreadStoreProvider, useDeleteStore: useThreadStore } = createDeleteStore<Thread>("Thread")
