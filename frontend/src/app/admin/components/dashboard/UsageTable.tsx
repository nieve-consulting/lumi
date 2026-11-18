import type { ModelUsage } from "@/generated/graphql"

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"

import ModelUsageTable from "../ModelUsageTable"

export default function UsageTable({ usage }: { usage: ModelUsage[] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">Model usage</CardTitle>
        <CardDescription>Model calls of the range by purpose and model, most expensive first</CardDescription>
      </CardHeader>
      <CardContent>
        {usage.length === 0 ? (
          <p className="text-muted-foreground text-sm">No model calls were recorded in this range.</p>
        ) : (
          <ModelUsageTable usage={usage} />
        )}
      </CardContent>
    </Card>
  )
}
