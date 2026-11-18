import { possessive } from "@/business"
import { listed } from "@/knowledge"
import {
  capabilityListInput,
  getPublicCapability,
  listPublicCapabilities,
  publicCapabilityPageSchema,
  publicCapabilitySchema,
} from "@/services/capabilities"
import { clientListInput, getPublicClient, listPublicClients, publicClientPageSchema, publicClientSchema } from "@/services/clients"
import { getPublicCompany, publicCompanySchema } from "@/services/company"
import {
  getPublicJobOpening,
  jobOpeningListInput,
  listPublicJobOpenings,
  publicJobOpeningPageSchema,
  publicJobOpeningSchema,
} from "@/services/jobOpenings"
import { pageSchema } from "@/services/pagination"
import { getPublicProject, listPublicProjects, projectListInput, publicProjectSchema, publicProjectSummarySchema } from "@/services/projects"
import {
  getPublicTeamMember,
  listPublicTeamMembers,
  publicTeamMemberPageSchema,
  publicTeamMemberSchema,
  teamMemberListInput,
} from "@/services/teamMembers"
import { currentContent } from "@/services/translations"
import { z } from "zod"

import { customerHint, idInput, keysWhere, languageInputShape, readWithOptions, withoutFields, withoutKeys, type ToolContext } from "./types"

// Anonymous reads of records the business has approved for external disclosure. Signing in never widens them: staff use the
// admin_ tools. Each takes the language to return the content in, English by default. Like Lumi's chat, they never return data
// from a source that is off: its tools aren't offered, and the filters and fields of other records that reference it are
// left out (a team member's project contributions name no client while clients are off)

// A public read: its input gains the language. Outdated translations read in English, as in Lumi's chat, so the business's
// website never shows facts the team has since corrected
const publicRead = readWithOptions("public", languageInputShape, ({ language }) => ({ language: currentContent(language) }))

// Built for the installation's business name, knowledge sources and resume switch, so the definitions only change when they do
export function publicReadTools({ businessName, knowledge: on, terms, resumes }: ToolContext) {
  const { teamMembers: t, projects: p, clients: c, capabilities: k, jobOpenings: j } = terms
  const PUBLIC_NOTE = `Public: no sign-in needed, returns only information ${businessName} has approved for external disclosure.`
  const customer = customerHint(c)

  // Filters and fields that reference a source that is off
  const projectFilters = keysWhere({ client_id: !on.clients, capability_ids: !on.capabilities })
  const teamMemberFilters = keysWhere({ capability_ids: !on.capabilities, project_id: !on.projects })
  const projectSummaryFields = keysWhere({ client: !on.clients })
  const projectFields = keysWhere({ client: !on.clients, capabilities: !on.capabilities, team_members: !on.teamMembers })
  // Nor a resume while the installation doesn't offer them
  const teamMemberFields = keysWhere({ capabilities: !on.capabilities, project_contributions: !on.projects, pdf_url: !resumes })
  const clientFields = keysWhere({ projects: !on.projects })

  const projectFilterText = listed([...(on.clients ? [`${c.singular}${customer}`] : []), ...(on.capabilities ? [k.plural] : [])], "or")
  const projectIdSources = listed([
    ...(on.capabilities ? [`${k.singular} ids from get_capabilities`] : []),
    ...(on.clients ? [`${c.singular} ids from get_clients`] : []),
  ])
  const teamMemberFilterText = listed(
    [...(on.capabilities ? [`${k.plural} (ids from get_capabilities)`] : []), ...(on.projects ? [`${p.singular} (id from get_projects)`] : [])],
    "or"
  )

  const projectTools = [
    publicRead({
      name: "get_projects",
      title: `Find public ${p.plural}`,
      description: `List or search ${possessive(businessName)} public ${p.plural}, most recent first.${projectFilterText ? ` Filter by ${projectFilterText} to find relevant ones; get ${projectIdSources}.` : ""} Use get_project for the details. ${PUBLIC_NOTE}`,
      input: withoutFields(projectListInput, projectFilters),
      output: pageSchema(withoutFields(publicProjectSummarySchema, projectSummaryFields)),
      run: async (ctx, input, options) => {
        const page = await listPublicProjects(ctx, input, options)
        return { ...page, items: page.items.map((project) => withoutKeys(project, projectSummaryFields)) }
      },
    }),
    publicRead({
      name: "get_project",
      title: `Get a public ${p.singular}`,
      description: `Details of a public ${p.singular}: ${listed([
        "description",
        "dates",
        "location",
        ...(on.capabilities ? [k.plural] : []),
        ...(on.clients ? [`public ${c.singular}`] : []),
        ...(on.teamMembers ? [`the public ${t.plural} who worked on it`] : []),
      ])}. ${PUBLIC_NOTE}`,
      input: idInput(p.singular, "get_projects"),
      output: withoutFields(publicProjectSchema, projectFields),
      run: async (ctx, { id }, options) => withoutKeys((await getPublicProject(ctx, id, options)).record, projectFields),
    }),
  ]

  const teamMemberTools = [
    publicRead({
      name: "get_team_members",
      title: `Find public ${t.plural}`,
      description: `List or search the ${t.plural} on ${possessive(businessName)} public team, with job titles and highlights.${teamMemberFilterText ? ` Filter by ${teamMemberFilterText}.` : ""} Use get_team_member for the full profile. ${PUBLIC_NOTE}`,
      input: withoutFields(teamMemberListInput, teamMemberFilters),
      output: publicTeamMemberPageSchema,
      run: (ctx, input, options) => listPublicTeamMembers(ctx, input, options),
    }),
    publicRead({
      name: "get_team_member",
      title: `Get a public ${t.singular} profile`,
      description: `Public profile of ${t.aSingular}: ${listed([
        "bio",
        "education",
        "work experience",
        ...(on.capabilities ? [`rated ${k.plural}`] : []),
        ...(on.projects ? [`contributions to public ${p.plural}`] : []),
      ])}${resumes ? ", with a downloadable PDF resume" : ""}. ${PUBLIC_NOTE}`,
      input: idInput(t.singular, "get_team_members"),
      output: withoutFields(publicTeamMemberSchema, teamMemberFields),
      run: async (ctx, { id }, options) => {
        const { record } = await getPublicTeamMember(ctx, id, options)
        // A contribution's project names its client only while clients are on
        const contributions = on.clients
          ? record.project_contributions
          : {
              ...record.project_contributions,
              items: record.project_contributions.items.map((item) => ({ ...item, project: { ...item.project, client: null } })),
            }
        return withoutKeys({ ...record, project_contributions: contributions }, teamMemberFields)
      },
    }),
  ]

  const clientTools = [
    publicRead({
      name: "get_clients",
      title: `Find public ${c.plural}${customerHint(c, true)}`,
      description: `List or search ${possessive(businessName)} public ${c.plural}: the customers ${businessName} works for. Use get_client for the details${on.projects ? ` and their public ${p.plural}` : ""}. ${PUBLIC_NOTE}`,
      input: clientListInput,
      output: publicClientPageSchema,
      run: (ctx, input, options) => listPublicClients(ctx, input, options),
    }),
    publicRead({
      name: "get_client",
      title: `Get a public ${c.singular}${customer}`,
      description: `Details of a public ${c.singular}${customer}${on.projects ? ` and its public ${p.plural}` : ""}. ${PUBLIC_NOTE}`,
      input: idInput(c.singular, "get_clients"),
      output: withoutFields(publicClientSchema, clientFields),
      run: async (ctx, { id }, options) => withoutKeys((await getPublicClient(ctx, id, options)).record, clientFields),
    }),
  ]

  // Capabilities are on only while team members or projects are (src/knowledge.ts)
  const usedBy = listed([...(on.projects ? [`public ${p.plural}`] : []), ...(on.teamMembers ? [`its public ${t.plural}`] : [])])
  const filtered = listed([...(on.projects ? ["get_projects"] : []), ...(on.teamMembers ? ["get_team_members"] : [])])
  // Only a public record of a source that is on makes a capability public
  const capabilityUsers = { projects: on.projects, teamMembers: on.teamMembers }
  const capabilityTools = [
    publicRead({
      name: "get_capabilities",
      title: `Find public ${k.plural}`,
      description: `List or search the ${k.plural} of ${possessive(businessName)} ${usedBy}. Use the ids to filter ${filtered}. ${PUBLIC_NOTE}`,
      input: capabilityListInput,
      output: publicCapabilityPageSchema,
      run: (ctx, input, options) => listPublicCapabilities(ctx, input, options, capabilityUsers),
    }),
    publicRead({
      name: "get_capability",
      title: `Get a public ${k.singular}`,
      description: `Name and description of a public ${k.singular}. ${PUBLIC_NOTE}`,
      input: idInput(k.singular, "get_capabilities"),
      output: publicCapabilitySchema,
      run: (ctx, { id }, options) => getPublicCapability(ctx, id, options, capabilityUsers),
    }),
  ]

  const jobOpeningTools = [
    publicRead({
      name: "get_job_openings",
      title: `Find public ${j.plural}`,
      description: `List or search ${possessive(businessName)} public ${j.plural}: the positions it recruits for, most recently posted first, with their title, summary, location, work mode, application link and posting date. Use get_job_opening for the full description. ${PUBLIC_NOTE}`,
      input: jobOpeningListInput,
      output: publicJobOpeningPageSchema,
      run: (ctx, input, options) => listPublicJobOpenings(ctx, input, options),
    }),
    publicRead({
      name: "get_job_opening",
      title: `Get a public ${j.singular}`,
      description: `Details of a public ${j.singular}: its full description (markdown), location, work mode, posting date and the link where candidates apply (null: ${possessive(businessName)} careers page). ${PUBLIC_NOTE}`,
      input: idInput(j.singular, "get_job_openings"),
      output: publicJobOpeningSchema,
      run: (ctx, { id }, options) => getPublicJobOpening(ctx, id, options),
    }),
  ]

  return [
    ...(on.projects ? projectTools : []),
    ...(on.teamMembers ? teamMemberTools : []),
    ...(on.clients ? clientTools : []),
    ...(on.capabilities ? capabilityTools : []),
    ...(on.jobOpenings ? jobOpeningTools : []),
    publicRead({
      name: "get_company_info",
      title: `Get ${possessive(businessName)} company information`,
      description: `The founding story, values, mission and vision of ${businessName}, with its location, contact phone and email, and website. ${PUBLIC_NOTE}`,
      input: z.object({}),
      output: publicCompanySchema,
      run: (ctx, _input, options) => getPublicCompany(ctx, options),
    }),
  ]
}
