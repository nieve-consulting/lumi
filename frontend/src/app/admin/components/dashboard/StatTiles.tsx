import type { DashboardDay, ModelUsage } from "@/generated/graphql"
import { TriangleAlert } from "lucide-react"

import { formatCost } from "@/lib/utils"
import { Card, CardContent, CardDescription, CardHeader } from "@/components/ui/card"

import { formatCompact, formatCount, formatNumber, formatShare } from "./format"

interface IProps {
  activity: DashboardDay[]
  conversationsCost?: number | null
  usage: ModelUsage[]
}

function StatTile({ label, value, children }: { label: string; value: string; children?: React.ReactNode }) {
  return (
    <Card>
      <CardHeader className="p-4 pb-1">
        <CardDescription>{label}</CardDescription>
        <p className="text-3xl font-semibold">{value}</p>
      </CardHeader>
      <CardContent className="text-muted-foreground p-4 pt-0 text-sm">{children}</CardContent>
    </Card>
  )
}

export default function StatTiles({ activity, conversationsCost, usage }: IProps) {
  const total = (key: "conversations" | "leads" | "meetings" | "cost" | "unpricedCalls") => activity.reduce((sum, day) => sum + day[key], 0)
  const conversations = total("conversations")
  const leads = total("leads")
  const meetings = total("meetings")
  const cost = total("cost")
  const unpricedCalls = total("unpricedCalls")

  // The conversations' prompt cache. Their embeddings are never cached, and the admin's own calls (record translation, the
  // writing assistant, website crawls) send each prompt once, so they would only dilute the rate of the prompts that can be
  const cacheable = usage.filter((model) => !model.adminCalls && model.purpose !== "embedding")
  const inputTokens = cacheable.reduce((sum, model) => sum + model.inputTokens, 0)
  const cachedInputTokens = cacheable.reduce((sum, model) => sum + model.cachedInputTokens, 0)

  return (
    <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
      <StatTile label="Conversations" value={formatNumber(conversations)}>
        {formatNumber(Math.round((conversations / activity.length) * 10) / 10)} per day
      </StatTile>
      <StatTile label="Leads" value={formatNumber(leads)}>
        {formatShare(leads, conversations)} of conversations left contact details
      </StatTile>
      <StatTile label="Meetings booked" value={formatNumber(meetings)}>
        {formatShare(meetings, conversations)} of conversations
      </StatTile>
      <StatTile label="AI cost" value={formatCost(cost)}>
        {unpricedCalls > 0 ? (
          <span className="flex items-start gap-1">
            <TriangleAlert className="mt-0.5 size-4 shrink-0 text-amber-500" aria-hidden />
            Incomplete: {formatCount(unpricedCalls, "model call")} without a price
          </span>
        ) : (
          // The cost of the range's conversations rather than of its calls, which include calls for earlier conversations. Their
          // calls all fall in the range, so it is only unknown when the range has calls without a price
          <>
            {conversations > 0 && conversationsCost != null
              ? `${formatCost(conversationsCost / conversations)} per conversation`
              : "No conversations"}
          </>
        )}
      </StatTile>
      <StatTile label="Prompt cache hits" value={formatShare(cachedInputTokens, inputTokens)}>
        {formatCompact(cachedInputTokens)} of {formatCompact(inputTokens)} conversation input tokens read from the cache
      </StatTile>
    </div>
  )
}
