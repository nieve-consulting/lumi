"use client"

import { useId } from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import type { SourceKey, SourceLabels } from "@lumi/shared-contracts/knowledge"
import {
  Award,
  BriefcaseBusiness,
  Building2,
  CalendarCog,
  GanttChart,
  Globe,
  Handshake,
  LayoutDashboard,
  MessageCircle,
  Users2,
  type LucideIcon,
} from "lucide-react"

import { showsSource } from "@/lib/knowledgeSources"
import { cn } from "@/lib/utils"

import { useSourceLabels, useStructuredSources } from "../SourceLabelsProvider"

interface NavItem {
  label: string
  href: string
  icon: LucideIcon
  // Only current on its own page, not on the pages below it
  exact?: boolean
  // The structured source page it is, hidden while the source is off
  source?: SourceKey
}

interface NavGroup {
  label?: string
  items: NavItem[]
  // Pinned groups sit at the bottom of the column
  pinned?: boolean
}

// The structured sources' pages take the installation's labels
const navGroups = (labels: SourceLabels): NavGroup[] => [
  {
    items: [
      // The admin root, so every other admin page is below it
      { label: "Dashboard", href: "/admin", icon: LayoutDashboard, exact: true },
      { label: "Conversations", href: "/admin/conversations", icon: MessageCircle },
    ],
  },
  {
    label: "Knowledge",
    items: [
      { label: "Websites", href: "/admin/websites", icon: Globe },
      { label: labels.teamMembers.plural, href: "/admin/team-members", icon: Users2, source: "teamMembers" },
      { label: labels.clients.plural, href: "/admin/clients", icon: Handshake, source: "clients" },
      { label: labels.projects.plural, href: "/admin/projects", icon: GanttChart, source: "projects" },
      { label: labels.capabilities.plural, href: "/admin/capabilities", icon: Award, source: "capabilities" },
      { label: labels.jobOpenings.plural, href: "/admin/job-openings", icon: BriefcaseBusiness, source: "jobOpenings" },
    ],
  },
  {
    label: "Settings",
    pinned: true,
    items: [
      { label: "Company", href: "/admin/settings", icon: Building2 },
      { label: "Appointments", href: "/admin/appointments", icon: CalendarCog },
    ],
  },
]

// "page" for the section's own page, "true" for a page nested inside it, such as /admin/clients/edit/123
function getCurrent(pathname: string, { href, exact }: NavItem): "page" | "true" | undefined {
  if (pathname === href) return "page"
  if (!exact && pathname.startsWith(`${href}/`)) return "true"
  return undefined
}

interface AdminNavProps {
  className?: string
  // Called when a link navigates in this tab, including to the current section's page, but not when it opens in a new
  // tab or window
  onNavigate?: () => void
}

export default function AdminNav({ className, onNavigate }: AdminNavProps) {
  const pathname = usePathname()
  const labels = useSourceLabels()
  const sources = useStructuredSources()
  const groups = navGroups(labels).map((group) => ({ ...group, items: group.items.filter(({ source }) => !source || showsSource(sources, source)) }))

  return (
    <nav aria-label="Admin" className={cn("flex flex-col gap-6", className)}>
      {groups.map((group, index) => (
        <NavSection key={group.label ?? index} group={group} pathname={pathname} onNavigate={onNavigate} />
      ))}
    </nav>
  )
}

interface NavSectionProps {
  group: NavGroup
  pathname: string
  onNavigate?: () => void
}

function NavSection({ group, pathname, onNavigate }: NavSectionProps) {
  const headingId = useId()

  return (
    <div className={cn(group.pinned && "mt-auto")}>
      {group.label && (
        <div id={headingId} className="mb-1 px-3 text-xs font-medium tracking-wide text-slate-500 uppercase">
          {group.label}
        </div>
      )}
      <ul aria-labelledby={group.label ? headingId : undefined} className="space-y-1">
        {group.items.map((item) => (
          <li key={item.href}>
            <NavLink item={item} current={getCurrent(pathname, item)} onNavigate={onNavigate} />
          </li>
        ))}
      </ul>
    </div>
  )
}

interface NavLinkProps {
  item: NavItem
  current?: "page" | "true"
  onNavigate?: () => void
}

function NavLink({ item: { label, href, icon: Icon }, current, onNavigate }: NavLinkProps) {
  return (
    <Link
      href={href}
      aria-current={current}
      onNavigate={onNavigate}
      className={cn(
        "focus-visible:ring-ring relative flex items-center gap-3 rounded-md px-3 py-2 text-sm outline-hidden transition-colors focus-visible:ring-2 focus-visible:ring-inset",
        current ? "bg-blue-50 font-semibold text-blue-700" : "font-medium text-slate-700 hover:bg-slate-100 hover:text-slate-900"
      )}
    >
      {current && <span aria-hidden className="absolute inset-y-2 left-0 w-1 rounded-r-full bg-blue-600" />}
      <Icon aria-hidden className="size-4 shrink-0" />
      <span className="truncate">{label}</span>
    </Link>
  )
}
