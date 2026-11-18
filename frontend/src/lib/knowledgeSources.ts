import { DEFAULT_SOURCE_LABELS, type SourceKey, type SourceLabels, type StructuredSources } from "@lumi/shared-contracts/knowledge"

// Whether a structured source shows in the admin: its page in the navigation, its dashboard tile and its sections in the
// forms of other records. Without sources, as when they couldn't be loaded, everything shows rather than hiding what an admin
// may need
// Capabilities only show while team members or projects do, as the chat uses them (sourcesInUse)
export function showsSource(sources: Partial<StructuredSources> | null | undefined, source: SourceKey): boolean {
  const on = sources?.[source] ?? true
  return source === "capabilities" ? on && (showsSource(sources, "teamMembers") || showsSource(sources, "projects")) : on
}

// The names the installation gives its structured sources, the defaults when they couldn't be loaded
export function labelsOf(sources: { labels?: SourceLabels | null } | null | undefined): SourceLabels {
  const labels = sources?.labels
  if (!labels) return DEFAULT_SOURCE_LABELS
  // Drops GraphQL's __typename so the labels can be sent back as input
  return {
    teamMembers: { singular: labels.teamMembers.singular, plural: labels.teamMembers.plural },
    projects: { singular: labels.projects.singular, plural: labels.projects.plural },
    clients: { singular: labels.clients.singular, plural: labels.clients.plural },
    capabilities: { singular: labels.capabilities.singular, plural: labels.capabilities.plural },
    jobOpenings: { singular: labels.jobOpenings.singular, plural: labels.jobOpenings.plural },
  }
}
