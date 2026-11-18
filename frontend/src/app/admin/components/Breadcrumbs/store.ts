"use client"

import { create } from "zustand"

export type Crumb = {
  label: string
  href?: string
}

interface BreadcrumbsStore {
  crumbs: Crumb[]
}

interface BreadcrumbsActions {
  setCrumbs: (crumbs: Crumb[]) => void
}

export const useBreadcumbsStore = create<BreadcrumbsStore & BreadcrumbsActions>((set) => ({
  crumbs: [],
  setCrumbs: (crumbs: Crumb[]) => {
    set({ crumbs })
  },
}))
