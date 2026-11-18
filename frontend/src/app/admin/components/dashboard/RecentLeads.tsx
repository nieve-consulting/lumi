import Link from "next/link"
import type { Thread } from "@/generated/graphql"
import { CalendarCheck } from "lucide-react"

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"

import { formatDateTime } from "./format"

interface IProps {
  leads: Pick<Thread, "id" | "createdAt" | "closed" | "topic" | "name" | "email" | "phone">[]
  timeZone: string
}

export default function RecentLeads({ leads, timeZone }: IProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">Recent leads</CardTitle>
        <CardDescription>Latest conversations that left an email or a phone number</CardDescription>
      </CardHeader>
      <CardContent>
        {leads.length === 0 ? (
          <p className="text-muted-foreground text-sm">No conversations left contact details in this range.</p>
        ) : (
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Started</TableHead>
                  <TableHead>Topic</TableHead>
                  <TableHead>Name</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Phone</TableHead>
                  <TableHead>Meeting</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {leads.map((lead) => (
                  <TableRow key={lead.id}>
                    <TableCell className="whitespace-nowrap">{formatDateTime(lead.createdAt, timeZone)}</TableCell>
                    <TableCell className="max-w-[400px] truncate font-medium">
                      <Link href={`/admin/conversations/${lead.id}`} className="hover:underline">
                        {lead.topic || <i>Ongoing chat</i>}
                      </Link>
                    </TableCell>
                    <TableCell>{lead.name || "--"}</TableCell>
                    <TableCell>{lead.email || "--"}</TableCell>
                    <TableCell>{lead.phone || "--"}</TableCell>
                    <TableCell>
                      {lead.closed ? (
                        <span className="flex items-center gap-1">
                          <CalendarCheck className="size-4 text-green-600" aria-hidden />
                          Booked
                        </span>
                      ) : (
                        "--"
                      )}
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
