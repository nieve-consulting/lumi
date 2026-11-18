"use client"

import type { Client } from "@/generated/graphql"

import { createDeleteStore } from "@/app/admin/components/table/deleteStore"

export const { Provider: ClientStoreProvider, useDeleteStore: useClientStore } = createDeleteStore<Client>("Client")
