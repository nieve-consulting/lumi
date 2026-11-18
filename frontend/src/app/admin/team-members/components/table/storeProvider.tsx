"use client"

import type { TeamMember } from "@/generated/graphql"

import { createDeleteStore } from "@/app/admin/components/table/deleteStore"

export const { Provider: TeamMemberStoreProvider, useDeleteStore: useTeamMemberStore } = createDeleteStore<TeamMember>("TeamMember")
