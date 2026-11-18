"use client"

import type { Project } from "@/generated/graphql"

import { createDeleteStore } from "@/app/admin/components/table/deleteStore"

export const { Provider: ProjectStoreProvider, useDeleteStore: useProjectStore } = createDeleteStore<Project>("Project")
