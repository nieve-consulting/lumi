"use client"

import type { DashboardDay } from "@/generated/graphql"
import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts"

import { formatCost } from "@/lib/utils"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart"

import { SERIES_COLORS } from "./colors"
import { formatCount, formatDay } from "./format"

interface IProps {
  activity: DashboardDay[]
  timeZone: string
}

const chartConfig = {
  cost: { label: "Cost", theme: SERIES_COLORS[0] },
} satisfies ChartConfig

const axisCostFormat = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", notation: "compact", maximumSignificantDigits: 2 })

export default function CostChart({ activity, timeZone }: IProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">AI cost</CardTitle>
        <CardDescription>
          Cost of the model calls made per day ({timeZone}): agent replies, helpers and summaries, and the admin&apos;s record translation and writing
          assistant
        </CardDescription>
      </CardHeader>
      <CardContent>
        <ChartContainer config={chartConfig} className="aspect-auto h-72 w-full">
          <BarChart data={activity} accessibilityLayer>
            <CartesianGrid vertical={false} />
            <XAxis dataKey="date" tickLine={false} axisLine={false} tickMargin={8} minTickGap={24} tickFormatter={(date) => formatDay(date)} />
            <YAxis tickLine={false} axisLine={false} width={48} tickFormatter={(cost) => axisCostFormat.format(cost)} />
            <ChartTooltip
              cursor={false}
              content={
                <ChartTooltipContent
                  className="min-w-48"
                  labelFormatter={(_, payload) => formatDay(payload[0]?.payload.date, "ccc, LLL d")}
                  formatter={(value, _, item) => (
                    <div className="flex w-full flex-col gap-1">
                      <div className="flex justify-between gap-4">
                        <span className="text-muted-foreground">Cost</span>
                        <span className="text-foreground font-mono font-medium tabular-nums">{formatCost(Number(value))}</span>
                      </div>
                      {item.payload.unpricedCalls > 0 && (
                        <span className="text-muted-foreground">Incomplete: {formatCount(item.payload.unpricedCalls, "call")} without a price</span>
                      )}
                    </div>
                  )}
                />
              }
            />
            <Bar dataKey="cost" fill="var(--color-cost)" maxBarSize={24} radius={[4, 4, 0, 0]} />
          </BarChart>
        </ChartContainer>
      </CardContent>
    </Card>
  )
}
