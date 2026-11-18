"use client"

import { useEffect } from "react"

import { useBreadcumbsStore, type Crumb } from "./store"

interface BreadcrumbSetterProps {
  crumbs: Crumb[]
}

export default function CrumbsSetter({ crumbs }: BreadcrumbSetterProps) {
  const { setCrumbs } = useBreadcumbsStore()

  useEffect(() => {
    setCrumbs(crumbs)
  }, [crumbs, setCrumbs])

  return null
}
