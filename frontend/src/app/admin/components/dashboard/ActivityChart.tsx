"use client"

import type { DashboardDay } from "@/generated/graphql"
import { ChevronDown } from "lucide-react"
import { Bar, BarChart, CartesianGrid, Rectangle, XAxis, YAxis, type BarShapeProps } from "recharts"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { ChartContainer, ChartLegend, ChartLegendContent, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart"
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"

import { SERIES_COLORS } from "./colors"
import { formatDay, formatNumber } from "./format"

interface IProps {
  activity: DashboardDay[]
  timeZone: string
}

// Stacked from the bottom: a booking leaves contact details, so meetings are counted among the leads. A conversation marked as
// booked by hand may have none, so the other conversations are those beyond the larger of the two, and the segments always add
// up to the day's conversations. The labels name each segment alone, since the leads segment leaves out the meetings that the
// Leads column counts. Segments are outlined in the card color to leave a gap between them
const chartConfig = {
  meetings: { label: "Booked a meeting", theme: SERIES_COLORS[0] },
  leads: { label: "Contact details, no meeting", theme: SERIES_COLORS[1] },
  others: { label: "No contact details", theme: SERIES_COLORS[2] },
} satisfies ChartConfig

const STACK = ["meetings", "leads", "others"] as const

// Rounds the top of each day's highest non-empty segment only, so every column gets a rounded end and the joins stay square
function segmentShape(key: (typeof STACK)[number]) {
  return function Segment(props: BarShapeProps) {
    const top = STACK.findLast((segment) => props.payload[segment] > 0)
    return <Rectangle {...props} radius={top === key ? [4, 4, 0, 0] : 0} />
  }
}

export default function ActivityChart({ activity, timeZone }: IProps) {
  const data = activity.map((day) => ({
    date: day.date,
    meetings: day.meetings,
    leads: Math.max(day.leads - day.meetings, 0),
    others: Math.max(day.conversations - Math.max(day.leads, day.meetings), 0),
  }))

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">Conversations</CardTitle>
        <CardDescription>Conversations started per day ({timeZone}), by how far they got</CardDescription>
      </CardHeader>
      <CardContent>
        <ChartContainer config={chartConfig} className="aspect-auto h-72 w-full">
          <BarChart data={data} accessibilityLayer>
            <CartesianGrid vertical={false} />
            <XAxis dataKey="date" tickLine={false} axisLine={false} tickMargin={8} minTickGap={24} tickFormatter={(date) => formatDay(date)} />
            <YAxis tickLine={false} axisLine={false} width={32} allowDecimals={false} />
            <ChartTooltip
              cursor={false}
              content={
                <ChartTooltipContent className="min-w-48" labelFormatter={(_, payload) => formatDay(payload[0]?.payload.date, "ccc, LLL d")} />
              }
            />
            <ChartLegend content={<ChartLegendContent className="flex-wrap [&>div]:whitespace-nowrap" />} itemSorter={null} />
            {STACK.map((key) => (
              <Bar
                key={key}
                dataKey={key}
                stackId="day"
                fill={`var(--color-${key})`}
                maxBarSize={24}
                stroke="hsl(var(--card))"
                strokeWidth={2}
                shape={segmentShape(key)}
              />
            ))}
          </BarChart>
        </ChartContainer>

        <Collapsible className="mt-2">
          <CollapsibleTrigger asChild>
            <Button variant="ghost" size="sm" className="group text-muted-foreground">
              Daily figures
              <ChevronDown className="transition-transform group-data-[state=open]:rotate-180" />
            </Button>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <div className="max-h-72 overflow-y-auto rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Day</TableHead>
                    <TableHead className="text-right">Conversations</TableHead>
                    <TableHead className="text-right">Leads</TableHead>
                    <TableHead className="text-right">Meetings</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody className="tabular-nums">
                  {activity.toReversed().map((day) => (
                    <TableRow key={day.date}>
                      <TableCell className="whitespace-nowrap">{formatDay(day.date, "ccc, LLL d")}</TableCell>
                      <TableCell className="text-right">{formatNumber(day.conversations)}</TableCell>
                      <TableCell className="text-right">{formatNumber(day.leads)}</TableCell>
                      <TableCell className="text-right">{formatNumber(day.meetings)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CollapsibleContent>
        </Collapsible>
      </CardContent>
    </Card>
  )
}
