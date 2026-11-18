"use client"

import type { Website } from "@/generated/graphql"

import { createDeleteStore } from "@/app/admin/components/table/deleteStore"

export const { Provider: WebsiteStoreProvider, useDeleteStore: useWebsiteStore } = createDeleteStore<Website>("Website")
