import { capabilities, clients, jobOpenings, projectCapabilities, projects, teamMemberCapabilities, teamMembers } from "@db/schema"
import { eq, sql } from "drizzle-orm"

// Public-data policy: what anonymous callers and the public website chatbot may see.
// - Projects and clients are public once staff publish them (`published`); creating or updating them never publishes.
// - Team members are public once staff publish them; unpublishing a team member who leaves hides them everywhere public.
// - Job openings are public once staff publish them; unpublishing one that is filled hides it everywhere public.
// - Capabilities have no flag of their own: a capability is public while a public project or public team member uses it, since those
//   records disclose it anyway.
// The same rules filter lists, searches, direct lookups and every nested relationship: a hidden record is never named,
// counted or linked from a public one, and looking it up answers not_found exactly like a missing id.

export const isPublicProject = eq(projects.published, true)

export const isPublicClient = eq(clients.published, true)

export const isPublicTeamMember = eq(teamMembers.published, true)

export const isPublicJobOpening = eq(jobOpenings.published, true)

const usedByPublicProject = sql<boolean>`exists (select 1 from ${projectCapabilities} inner join ${projects} on ${projects.id} = ${projectCapabilities.project_id} where ${projectCapabilities.capability_id} = ${capabilities.id} and ${projects.published})`

const usedByPublicTeamMember = sql<boolean>`exists (select 1 from ${teamMemberCapabilities} inner join ${teamMembers} on ${teamMembers.id} = ${teamMemberCapabilities.team_member_id} where ${teamMemberCapabilities.capability_id} = ${capabilities.id} and ${teamMembers.published})`

export const isPublicCapability = sql<boolean>`(${usedByPublicProject} or ${usedByPublicTeamMember})`

// The records whose use makes a capability public: those of the structured sources that are on (src/knowledge.ts)
export type CapabilityUsers = { projects: boolean; teamMembers: boolean }

// A capability is public while a public record of a source that is on uses it, so one only a project uses isn't disclosed
// while projects are off
export function isPublicCapabilityIn({ projects: viaProjects, teamMembers: viaTeamMembers }: CapabilityUsers) {
  if (viaProjects && viaTeamMembers) return isPublicCapability
  if (viaProjects) return usedByPublicProject
  if (viaTeamMembers) return usedByPublicTeamMember
  return sql<boolean>`false`
}
