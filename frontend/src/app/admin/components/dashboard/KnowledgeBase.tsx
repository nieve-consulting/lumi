import Link from "next/link"
import type { DashboardContent, DashboardWebsite } from "@/generated/graphql"
import { inSentence, SOURCE_KEYS, type SourceKey, type SourceLabels, type StructuredSources } from "@lumi/shared-contracts/knowledge"
import { DateTime } from "luxon"

import { labelsOf, showsSource } from "@/lib/knowledgeSources"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"

import { formatNumber } from "./format"

interface IProps {
  content: DashboardContent
  websites: DashboardWebsite[]
  // The structured sources that are on, whose tiles show, and their labels. All show, with the default labels, without them
  sources?: (StructuredSources & { labels?: SourceLabels | null }) | null
}

// Websites are crawled on demand: after this long their pages may be out of date
const STALE_AFTER_DAYS = 30

function CrawlStatus({ lastProcessed }: { lastProcessed?: string | null }) {
  if (!lastProcessed) {
    return <Badge variant="destructive">Never crawled</Badge>
  }

  const crawledAt = DateTime.fromISO(lastProcessed)
  return (
    <span className="flex items-center gap-2">
      {crawledAt.toRelative()}
      {DateTime.now().diff(crawledAt, "days").days > STALE_AFTER_DAYS && <Badge variant="outline">Stale</Badge>}
    </span>
  )
}

interface Tile {
  label: string
  href: string
  value: number
  // "of 12 published"
  of?: string
  source?: SourceKey
}

export default function KnowledgeBase({ content, websites, sources }: IProps) {
  const labels = labelsOf(sources)
  // The structured sources that are off, whose tiles are hidden
  const offLabels = SOURCE_KEYS.filter((key) => !showsSource(sources, key)).map((key, index) =>
    index ? inSentence(labels[key].plural) : labels[key].plural
  )
  const tiles: Tile[] = [
    {
      label: labels.teamMembers.plural,
      href: "/admin/team-members",
      value: content.teamMembers.published,
      of: `of ${formatNumber(content.teamMembers.total)} published`,
      source: "teamMembers",
    },
    {
      label: labels.projects.plural,
      href: "/admin/projects",
      value: content.projects.published,
      of: `of ${formatNumber(content.projects.total)} published`,
      source: "projects",
    },
    {
      label: labels.clients.plural,
      href: "/admin/clients",
      value: content.clients.published,
      of: `of ${formatNumber(content.clients.total)} published`,
      source: "clients",
    },
    { label: labels.capabilities.plural, href: "/admin/capabilities", value: content.capabilities, source: "capabilities" },
    {
      label: labels.jobOpenings.plural,
      href: "/admin/job-openings",
      value: content.jobOpenings.published,
      of: `of ${formatNumber(content.jobOpenings.total)} published`,
      source: "jobOpenings",
    },
  ]

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">Knowledge base</CardTitle>
        <CardDescription>What Lumi can tell visitors about right now, whatever the range</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-6">
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          {tiles
            .filter(({ source }) => !source || showsSource(sources, source))
            .map((tile) => (
              <Link key={tile.href} href={tile.href} className="hover:bg-muted/50 rounded-md border p-4">
                <p className="text-muted-foreground text-sm">{tile.label}</p>
                <p className="text-2xl font-semibold">
                  {formatNumber(tile.value)} {tile.of && <span className="text-muted-foreground text-base font-normal">{tile.of}</span>}
                </p>
              </Link>
            ))}
        </div>
        {offLabels.length > 0 && (
          <p className="text-muted-foreground -mt-2 text-sm">
            {new Intl.ListFormat("en", { type: "conjunction" }).format(offLabels)} are turned off. Turn sources on in{" "}
            <Link href="/admin/settings?tab=knowledge" className="font-medium text-blue-700 underline">
              Settings → Knowledge sources
            </Link>
            .
          </p>
        )}

        {websites.length === 0 ? (
          <p className="text-muted-foreground text-sm">No websites are set up for Lumi to search.</p>
        ) : (
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Website</TableHead>
                  <TableHead>URL</TableHead>
                  <TableHead className="text-right">Pages</TableHead>
                  <TableHead>Last crawl</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {websites.map((website) => (
                  <TableRow key={website.id}>
                    <TableCell className="font-medium">
                      <Link href={`/admin/websites/edit/${website.id}`} className="hover:underline">
                        {website.name}
                      </Link>
                    </TableCell>
                    <TableCell className="text-muted-foreground">{website.url}</TableCell>
                    <TableCell className="text-right tabular-nums">{formatNumber(website.pages)}</TableCell>
                    <TableCell>
                      <CrawlStatus lastProcessed={website.lastProcessed} />
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
