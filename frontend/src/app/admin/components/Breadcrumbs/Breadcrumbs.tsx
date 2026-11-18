"use client"

import { Fragment } from "react"
import Link from "next/link"

import { Breadcrumb, BreadcrumbItem, BreadcrumbLink, BreadcrumbList, BreadcrumbPage, BreadcrumbSeparator } from "@/components/ui/breadcrumb"
import { Skeleton } from "@/components/ui/skeleton"

import { useBreadcumbsStore } from "./store"

export default function Breadcrumbs() {
  const { crumbs } = useBreadcumbsStore()

  if (crumbs.length === 0) {
    return <Skeleton className="h-4 w-20 bg-slate-300" />
  }

  return (
    <Breadcrumb>
      <BreadcrumbList>
        {crumbs.slice(0, -1).map((crumb, index) => (
          <Fragment key={index}>
            <BreadcrumbItem key={index}>
              <BreadcrumbLink asChild>
                <Link href={crumb.href || ""}>{crumb.label}</Link>
              </BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator />
          </Fragment>
        ))}
        <BreadcrumbItem>
          <BreadcrumbPage>{crumbs[crumbs.length - 1].label}</BreadcrumbPage>
        </BreadcrumbItem>
      </BreadcrumbList>
    </Breadcrumb>
  )
}
