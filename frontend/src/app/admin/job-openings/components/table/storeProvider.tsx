"use client"

import type { JobOpening } from "@/generated/graphql"

import { createDeleteStore } from "@/app/admin/components/table/deleteStore"

export const { Provider: JobOpeningStoreProvider, useDeleteStore: useJobOpeningStore } = createDeleteStore<JobOpening>("JobOpening")
