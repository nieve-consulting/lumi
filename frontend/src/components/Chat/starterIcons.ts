import type { StarterIcon } from "@lumi/shared-contracts/business"
import { BriefcaseBusiness, CalendarDays, FolderOpen, Info, MessagesSquare, Search, Sparkles, Users, type LucideIcon } from "lucide-react"

// The lucide icon of each icon a starter can name
export const STARTER_ICON_COMPONENTS: Record<StarterIcon, LucideIcon> = {
  message: MessagesSquare,
  folder: FolderOpen,
  briefcase: BriefcaseBusiness,
  calendar: CalendarDays,
  search: Search,
  info: Info,
  sparkles: Sparkles,
  users: Users,
}

// How the settings forms name each icon
export const STARTER_ICON_NAMES: Record<StarterIcon, string> = {
  message: "Speech bubbles",
  folder: "Folder",
  briefcase: "Briefcase",
  calendar: "Calendar",
  search: "Magnifying glass",
  info: "Information",
  sparkles: "Sparkles",
  users: "People",
}
