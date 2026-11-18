import { teamCapabilitySchema, type TeamCapability } from "@/services/capabilities"
import { teamClientSchema, type TeamClient } from "@/services/clients"
import { pageSchema } from "@/services/pagination"
import {
  addCapabilitiesResultSchema,
  contributionResultSchema,
  teamProjectSchema,
  teamProjectSummarySchema,
  type TeamProject,
} from "@/services/projects"
import { addTeamMemberCapabilitiesResultSchema, teamTeamMemberSchema, type TeamTeamMember } from "@/services/teamMembers"
import type { CapabilityUsers } from "@/services/visibility"
import type { KnowledgeSources } from "@lumi/shared-contracts/knowledge"

import { keysWhere, withoutFields, withoutKeys } from "./types"

// The team records the admin_ reads and the writes return, without the fields of sources that are off, as the public reads:
// a source that is off never reaches a tool result, whoever is signed in. Nor does a team member's pdf_url while the
// installation doesn't offer resumes. Each record type has its published schema and the view that removes the same fields
// from a result
export function teamRecordViews(on: KnowledgeSources, resumes: boolean) {
  const projectSummaryFields = keysWhere({ client: !on.clients })
  const projectFields = keysWhere({ client: !on.clients, capabilities: !on.capabilities, team_members: !on.teamMembers })
  const teamMemberFields = keysWhere({ capabilities: !on.capabilities, project_contributions: !on.projects, pdf_url: !resumes })
  const clientFields = keysWhere({ projects: !on.projects })
  const usageFields = keysWhere({ projects: !on.projects, team_members: !on.teamMembers })

  const projectSchema = withoutFields(teamProjectSchema, projectFields)
  const project = <T extends TeamProject>(record: T) => withoutKeys(record, projectFields)
  const teamMemberSchema = withoutFields(teamTeamMemberSchema, teamMemberFields)
  const teamMember = <T extends TeamTeamMember>(record: T) => withoutKeys(record, teamMemberFields)

  return {
    // Capabilities count as public only through the records of the sources that are on
    capabilityUsers: { projects: on.projects, teamMembers: on.teamMembers } satisfies CapabilityUsers,

    projectPageSchema: pageSchema(withoutFields(teamProjectSummarySchema, projectSummaryFields)),
    projectPage: <T extends { items: object[] }>(page: T) => ({ ...page, items: page.items.map((item) => withoutKeys(item, projectSummaryFields)) }),
    projectSchema,
    project,
    teamMemberSchema,
    teamMember,
    clientSchema: withoutFields(teamClientSchema, clientFields),
    client: (record: TeamClient) => withoutKeys(record, clientFields),
    capabilitySchema: teamCapabilitySchema.extend({ usage: withoutFields(teamCapabilitySchema.shape.usage, usageFields) }),
    capability: (record: TeamCapability) => ({ ...record, usage: withoutKeys(record.usage, usageFields) }),

    // The results of the writes that link records return the project or team member the same way
    contributionResultSchema: contributionResultSchema.extend({ project: projectSchema }),
    addCapabilitiesResultSchema: addCapabilitiesResultSchema.extend({ project: projectSchema }),
    linkedProject: <T extends { project: TeamProject }>(result: T) => ({ ...result, project: project(result.project) }),
    addTeamMemberCapabilitiesResultSchema: addTeamMemberCapabilitiesResultSchema.extend({ team_member: teamMemberSchema }),
    linkedTeamMember: <T extends { team_member: TeamTeamMember }>(result: T) => ({ ...result, team_member: teamMember(result.team_member) }),
  }
}
