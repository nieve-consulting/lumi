import Link from "next/link"
import type { SourceKey } from "@lumi/shared-contracts/knowledge"
import { CircleMinus } from "lucide-react"

import { labelsOf, showsSource } from "@/lib/knowledgeSources"

import { getKnowledgeSources } from "./getKnowledgeSources"

// Shown on a structured source's own pages while it is off: they stay reachable, e.g. from a bookmark, to edit the records
// before turning the source back on. Nothing while it's on or the sources couldn't be loaded
export default async function SourceOffNotice({ source }: { source: SourceKey }) {
  const sources = await getKnowledgeSources()
  if (showsSource(sources, source)) return null

  return (
    <p className="mb-6 flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
      <CircleMinus size={16} aria-hidden className="mt-0.5 shrink-0" />
      <span>
        {labelsOf(sources)[source].plural} are turned off. Lumi doesn&apos;t use them; your records are kept. Turn them on in{" "}
        <Link href="/admin/settings?tab=knowledge" className="font-medium underline">
          Settings → Knowledge sources
        </Link>
        .
      </span>
    </p>
  )
}
