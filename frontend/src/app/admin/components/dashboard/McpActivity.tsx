import type { DashboardMcp } from "@/generated/graphql"

import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"

import { formatCount, formatDateTime, formatNumber } from "./format"

export default function McpActivity({ mcp, timeZone }: { mcp: DashboardMcp; timeZone: string }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">MCP writes</CardTitle>
        <CardDescription>
          {formatCount(mcp.calls, "change")} made through the MCP server in this range, {formatNumber(mcp.errors)} failed
        </CardDescription>
      </CardHeader>
      <CardContent>
        {mcp.recent.length === 0 ? (
          <p className="text-muted-foreground text-sm">No changes were made through the MCP server in this range.</p>
        ) : (
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>When</TableHead>
                  <TableHead>Who</TableHead>
                  <TableHead>Change</TableHead>
                  <TableHead>Outcome</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {mcp.recent.map((event) => (
                  <TableRow key={event.id}>
                    <TableCell className="whitespace-nowrap">{formatDateTime(event.createdAt, timeZone)}</TableCell>
                    <TableCell>{event.actorEmail}</TableCell>
                    <TableCell>
                      <span className="font-mono text-xs">{event.tool}</span>
                      {event.recordType && <span className="text-muted-foreground block text-xs">{event.recordType}</span>}
                    </TableCell>
                    <TableCell>
                      <Badge variant={event.outcome === "success" ? "secondary" : "destructive"}>{event.outcome}</Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
