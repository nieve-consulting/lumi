import { possessive } from "@/business"
import { listed } from "@/knowledge"
import { capabilityListInput, getTeamCapability, listTeamCapabilities, teamCapabilityPageSchema } from "@/services/capabilities"
import { clientListInput, getTeamClient, listTeamClients, teamClientPageSchema } from "@/services/clients"
import { listWorkExperiences, workExperienceListInput, workExperiencePageSchema } from "@/services/experiences"
import { getTeamJobOpening, jobOpeningListInput, listTeamJobOpenings, teamJobOpeningPageSchema, teamJobOpeningSchema } from "@/services/jobOpenings"
import { prepareProjectFromUrl, prepareProjectFromUrlInput, projectDraftSchema } from "@/services/projectDrafts"
import { getTeamProject, listTeamProjects, projectListInput } from "@/services/projects"
import { getTeamTeamMember, listTeamTeamMembers, teamMemberListInput, teamTeamMemberPageSchema } from "@/services/teamMembers"

import { teamRecordViews } from "./teamRecords"
import {
  capitalized,
  customerHint,
  defineTool,
  idInput,
  keysWhere,
  missingLanguageInputShape,
  READ,
  readWithOptions,
  teamLanguageInputShape,
  withoutFields,
  type ToolContext,
} from "./types"

// Staff reads (OAuth, lumi:read, Lumi team members): every record, published or not, with the ids and versions needed to
// link and update records. Always look records up here before linking or creating, and never guess ids. Each takes the
// language to return the content in, English by default, and the lists can keep the records missing a translation. The
// tools of a source that is off aren't offered, nor the list filters or result fields that reference one

const LANGUAGE_NOTE =
  "Returns the content in language, English by default: when it is unclear which one the user means (e.g. they write in Spanish about a record), ask whether they want its Spanish translation or its English content."

// A team read: its input gains the language, read as saved
const teamRead = readWithOptions("read", teamLanguageInputShape, ({ language }) => ({ language }))

// A team list: a team read that can also keep the records missing a translation
const teamList = readWithOptions("read", { ...teamLanguageInputShape, ...missingLanguageInputShape }, ({ language, missing_language }) => ({
  language,
  missingLanguage: missing_language,
}))

// Built for the installation's business name, knowledge sources and resume switch, so the definitions only change when they do
export function teamReadTools({ businessName, knowledge: on, terms, resumes }: ToolContext) {
  const { teamMembers: t, projects: p, clients: c, capabilities: k, jobOpenings: j } = terms
  const TEAM_NOTE = `Team only (${possessive(businessName)} staff): requires signing in with a Lumi team account. Includes unpublished records.`
  const customer = customerHint(c)
  const views = teamRecordViews(on, resumes)

  const projectFilters = keysWhere({ client_id: !on.clients, capability_ids: !on.capabilities })
  const teamMemberFilters = keysWhere({ capability_ids: !on.capabilities, project_id: !on.projects })

  // The writes that change a project's relationships, among those offered
  const projectLinkTools = [...(on.teamMembers ? ["add_team_member_to_project"] : []), ...(on.capabilities ? ["add_capabilities_to_project"] : [])]

  const projectRelations = listed([
    ...(on.clients ? [c.singular] : []),
    ...(on.capabilities ? [k.plural] : []),
    ...(on.teamMembers ? [`${t.singular} contributions with their versions and languages`] : []),
  ])

  const projectTools = [
    teamList({
      name: "admin_get_projects",
      title: `Find ${p.plural} (team)`,
      description: `Search all Lumi ${p.plural} by name or description, optionally filtered by ${listed(
        [...(on.clients ? [`${c.singular}${customer}`] : []), ...(on.capabilities ? [k.plural] : [])].concat(
          `a missing translation of the ${p.singular}${on.teamMembers ? ` or of one of its ${t.singular} contributions` : ""}`
        ),
        "or"
      )}. Use it to find an existing ${p.singular} before creating one or linking records to it. ${LANGUAGE_NOTE} ${TEAM_NOTE}`,
      input: withoutFields(projectListInput, projectFilters),
      output: views.projectPageSchema,
      run: async (ctx, input, options) => views.projectPage(await listTeamProjects(ctx, input, options)),
    }),
    teamRead({
      name: "admin_get_project",
      title: `Get ${p.aSingular} (team)`,
      description: `All editable fields of ${p.aSingular}${projectRelations ? `, its ${projectRelations}` : ""}, and the ${p.singular} version needed by ${listed(["update_project", ...projectLinkTools])}. ${LANGUAGE_NOTE} ${TEAM_NOTE}`,
      input: idInput(p.singular, "admin_get_projects"),
      output: views.projectSchema,
      run: async (ctx, { id }, options) => views.project(await getTeamProject(ctx, id, options)),
    }),
  ]

  const prepareProject = defineTool({
    name: "prepare_project_from_url",
    title: `Draft ${p.aSingular} from an article (team)`,
    description: `Fetch a public article or blog post about ${p.aSingular} and prepare a draft for create_project: field values with their source (article, user context or suggested), candidate existing ${listed(
      [p.plural, ...(on.clients ? [c.plural] : []), ...(on.capabilities ? [k.plural] : []), ...(on.teamMembers ? [t.plural] : [])]
    )}, and the missing or ambiguous fields to clarify. The text fields are written in language, English by default, translated from the article if needed; ask the user which language they want when it is unclear. Writes nothing. If the article cannot be fetched, ask the user to paste its text and call again with article_text. Review the draft with the user before calling create_project with source_url, with English content and a draft in another language as its translation. ${TEAM_NOTE}`,
    access: "read",
    input: prepareProjectFromUrlInput,
    output: projectDraftSchema,
    annotations: { ...READ, idempotentHint: false, openWorldHint: true },
    run: async (ctx, input) => {
      const draft = await prepareProjectFromUrl(ctx, input)
      // No candidates from a source that is off, which create_project can't link
      return {
        ...draft,
        candidates: {
          ...draft.candidates,
          clients: on.clients ? draft.candidates.clients : [],
          capabilities: on.capabilities ? draft.candidates.capabilities : [],
          team_members: on.teamMembers ? draft.candidates.team_members : [],
        },
      }
    },
  })

  const teamMemberTools = [
    teamList({
      name: "admin_get_team_members",
      title: `Find ${t.plural} (team)`,
      description: `Search Lumi ${t.plural} by name, job title or highlights, optionally filtered by ${listed(
        [...(on.capabilities ? [k.plural] : []), ...(on.projects ? [p.singular] : [])].concat(
          "a missing translation of the profile or of one of their work experience entries"
        ),
        "or"
      )}. Includes unpublished ${t.plural}, such as people who left ${businessName}. Several people can share a name: confirm with the user which one they mean. ${LANGUAGE_NOTE} ${TEAM_NOTE}`,
      input: withoutFields(teamMemberListInput, teamMemberFilters),
      output: teamTeamMemberPageSchema,
      run: (ctx, input, options) => listTeamTeamMembers(ctx, input, options),
    }),
    teamRead({
      name: "admin_get_team_member",
      title: `Get ${t.aSingular} (team)`,
      description: `${capitalized(possessive(t.aSingular))} editable profile (name, job title, bio, education, highlights, webpage), ${listed([
        ...(on.capabilities ? [`${k.singular} ratings`] : []),
        ...(on.projects ? [`${p.singular} contributions`] : []),
        "recent work experience",
      ])}, with the versions needed for updates. A general "profile summary" is the bio field. ${LANGUAGE_NOTE} ${TEAM_NOTE}`,
      input: idInput(t.singular, "admin_get_team_members"),
      output: views.teamMemberSchema,
      run: async (ctx, { id }, options) => views.teamMember(await getTeamTeamMember(ctx, id, options)),
    }),
  ]

  const workExperiences = teamList({
    name: "admin_get_work_experiences",
    title: `List ${possessive(t.aSingular)} work experience (team)`,
    description: `${capitalized(possessive(t.aSingular))} work experience entries (employment history) with ids and versions, optionally only those missing a translation, most recent first: ongoing entries by start date, then completed ones by end date. most_recent names the latest entry, or explains why it is ambiguous so you can ask the user. ${LANGUAGE_NOTE} ${TEAM_NOTE}`,
    input: workExperienceListInput,
    output: workExperiencePageSchema,
    run: (ctx, input, options) => listWorkExperiences(ctx, input, options),
  })

  const clientTools = [
    teamList({
      name: "admin_get_clients",
      title: `Find ${c.plural}${customerHint(c, true)} (team)`,
      description: `Search all Lumi ${c.plural} by name or summary, optionally keeping those missing a translation. ${c.Plural} are the customers ${businessName} works for.${on.projects ? ` Use it to find the client_id for ${p.aSingular}.` : ""} ${LANGUAGE_NOTE} ${TEAM_NOTE}`,
      input: clientListInput,
      output: teamClientPageSchema,
      run: (ctx, input, options) => listTeamClients(ctx, input, options),
    }),
    teamRead({
      name: "admin_get_client",
      title: `Get ${c.aSingular}${customer} (team)`,
      description: `All fields of ${c.aSingular}${customer}, including its internal page${on.projects ? `, its ${p.plural}` : ""} and the version needed by update_client. ${LANGUAGE_NOTE} ${TEAM_NOTE}`,
      input: idInput(c.singular, "admin_get_clients"),
      output: views.clientSchema,
      run: async (ctx, { id }, options) => views.client(await getTeamClient(ctx, id, options)),
    }),
  ]

  // Capabilities are on only while team members or projects are (src/knowledge.ts)
  const linkedTo = listed([...(on.projects ? [p.plural] : []), ...(on.teamMembers ? [t.plural] : [])], "or")
  const capabilityTools = [
    teamList({
      name: "admin_get_capabilities",
      title: `Find ${k.plural} (team)`,
      description: `Search all Lumi ${k.plural} by name, optionally keeping those missing a translation. Use it to find ${k.singular} ids before linking them to ${linkedTo}, and before creating ${k.aSingular}. ${LANGUAGE_NOTE} ${TEAM_NOTE}`,
      input: capabilityListInput,
      output: teamCapabilityPageSchema,
      run: (ctx, input, options) => listTeamCapabilities(ctx, input, options, views.capabilityUsers),
    }),
    teamRead({
      name: "admin_get_capability",
      title: `Get ${k.aSingular} (team)`,
      description: `${capitalized(possessive(k.aSingular))} fields, whether it is public, how many ${listed([...(on.projects ? [p.plural] : []), ...(on.teamMembers ? [t.plural] : [])])} use it, and the version needed by update_capability. ${LANGUAGE_NOTE} ${TEAM_NOTE}`,
      input: idInput(k.singular, "admin_get_capabilities"),
      output: views.capabilitySchema,
      run: async (ctx, { id }, options) => views.capability(await getTeamCapability(ctx, id, options, views.capabilityUsers)),
    }),
  ]

  const jobOpeningTools = [
    teamList({
      name: "admin_get_job_openings",
      title: `Find ${j.plural} (team)`,
      description: `Search all Lumi ${j.plural} by title, summary or location, most recently posted first, optionally keeping those missing a translation. Includes unpublished ${j.plural}, such as filled positions. Use it to find an existing ${j.singular} before creating one. ${LANGUAGE_NOTE} ${TEAM_NOTE}`,
      input: jobOpeningListInput,
      output: teamJobOpeningPageSchema,
      run: (ctx, input, options) => listTeamJobOpenings(ctx, input, options),
    }),
    teamRead({
      name: "admin_get_job_opening",
      title: `Get ${j.aSingular} (team)`,
      description: `All fields of ${j.aSingular}, including its full description, and the version needed by update_job_opening and publish_record. ${LANGUAGE_NOTE} ${TEAM_NOTE}`,
      input: idInput(j.singular, "admin_get_job_openings"),
      output: teamJobOpeningSchema,
      run: (ctx, { id }, options) => getTeamJobOpening(ctx, id, options),
    }),
  ]

  return [
    ...(on.projects ? projectTools : []),
    ...(on.teamMembers ? teamMemberTools : []),
    ...(on.clients ? clientTools : []),
    ...(on.capabilities ? capabilityTools : []),
    ...(on.jobOpenings ? jobOpeningTools : []),
    // Work experience belongs to team members
    ...(on.teamMembers ? [workExperiences] : []),
    ...(on.projects ? [prepareProject] : []),
  ]
}
