import { possessive } from "@/business"
import { listed } from "@/knowledge"
import { createCapability, createCapabilityInput, updateCapability, updateCapabilityInput } from "@/services/capabilities"
import { createClient, createClientInput, updateClient, updateClientInput } from "@/services/clients"
import {
  addWorkExperience,
  addWorkExperienceInput,
  teamExperienceSchema,
  updateWorkExperience,
  updateWorkExperienceInput,
} from "@/services/experiences"
import { createJobOpening, createJobOpeningInput, teamJobOpeningSchema, updateJobOpening, updateJobOpeningInput } from "@/services/jobOpenings"
import {
  addCapabilitiesToProject,
  addCapabilitiesToProjectInput,
  addTeamMemberToProject,
  addTeamMemberToProjectInput,
  createProject,
  createProjectInput,
  projectPatchFields,
  updateProject,
  updateProjectContribution,
  updateProjectContributionInput,
  updateProjectInput,
} from "@/services/projects"
import {
  publicationSchema,
  publishRecord,
  publishRecordInput,
  unpublishRecord,
  unpublishRecordInput,
  type PublishableRecordType,
} from "@/services/publishing"
import { patchSchema } from "@/services/records"
import { uuidField } from "@/services/rules"
import {
  addCapabilitiesToTeamMember,
  addCapabilitiesToTeamMemberInput,
  createTeamMember,
  createTeamMemberInput,
  updateTeamMember,
  updateTeamMemberCapability,
  updateTeamMemberCapabilityInput,
  updateTeamMemberInput,
} from "@/services/teamMembers"
import { z } from "zod"

import { teamRecordViews } from "./teamRecords"
import {
  ADDITIVE_WRITE,
  capitalized,
  customerHint,
  defineTool,
  keysWhere,
  mutationOutput,
  mutationResult,
  OVERWRITING_WRITE,
  withoutFields,
  type ToolContext,
} from "./types"

// Staff writes (OAuth, lumi:write, Lumi team members). Every write is atomic, idempotent per idempotency_key and audited.
// Show the user what will be written before calling them. Updates need the version from the latest admin_ read and fail
// with a conflict when the record changed since. Only publish_record makes a record public. Records are created from their
// English content, optionally with a translation; updates write one language, English by default. The writes of a source
// that is off aren't offered, nor the fields that link one or the result fields that reference one, and publish_record only
// takes the record types that are on

const UPDATE_NOTE = "Only the fields in patch change; null clears an optional field. Pass expected_version from your latest read."
const CREATE_NOTE = "The new record is not published: publish it with publish_record only when the user asks."
const CREATE_LANGUAGE_NOTE =
  "Text fields are in English, the record's source; translation adds another language in the same call. When the user gives the text in another language, propose the English for them to confirm and pass theirs as translation."
const UPDATE_LANGUAGE_NOTE =
  "language picks the translation the patch writes, English by default: ask the user which language they mean when it is unclear (e.g. they write in Spanish about a record). In another language the patch holds only translatable text: fields every language shares are rejected. Writing a language whose translation is an AI draft (translations[].draft) replaces the draft with the patch: its fields the patch leaves out read in English, as no tool returns a draft's text. Suggest the user reviews drafts in Lumi's admin interface instead."

// Built for the installation's business name, knowledge sources and resume switch, so the definitions only change when they do
export function writeTools({ businessName, knowledge: on, terms, resumes }: ToolContext) {
  const { teamMembers: t, projects: p, clients: c, capabilities: k, jobOpenings: j } = terms
  const WRITE_NOTE = `Team only (${possessive(businessName)} staff, lumi:write). Never invent facts or ids: resolve referenced records with the admin_ tools first and ask the user for missing required values. Send a new idempotency_key per change and reuse it only to retry the same call.`
  const customer = customerHint(c)
  const views = teamRecordViews(on, resumes)

  // Inputs without the fields that link a source that is off
  const projectLinks = [
    ...(on.clients ? [`an existing ${c.singular}${customer}`] : []),
    ...(on.capabilities ? [`existing ${k.plural}`] : []),
    ...(on.teamMembers ? [`existing ${t.plural} with their contribution dates (never assumed from the ${p.singular} dates)`] : []),
  ]
  const createProjectSchema = withoutFields(
    createProjectInput,
    keysWhere({ client_id: !on.clients, capability_ids: !on.capabilities, team_members: !on.teamMembers })
  )
  const projectRelations = [...(on.teamMembers ? [t.plural] : []), ...(on.capabilities ? [k.plural] : [])]
  const projectLinkTools = [
    ...(on.teamMembers ? ["add_team_member_to_project", "update_project_contribution"] : []),
    ...(on.capabilities ? ["add_capabilities_to_project"] : []),
  ]
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { client_id, ...patchWithoutClient } = projectPatchFields
  const updateProjectSchema = updateProjectInput.extend({
    patch: patchSchema(on.clients ? projectPatchFields : patchWithoutClient).describe(
      `Fields to change.${projectLinkTools.length ? ` Use ${listed(projectLinkTools)} for relationships` : ""}`
    ),
  })
  const createTeamMemberSchema = withoutFields(createTeamMemberInput, keysWhere({ capabilities: !on.capabilities }))
  const updateTeamMemberSchema = on.capabilities
    ? updateTeamMemberInput
    : updateTeamMemberInput.extend({ patch: updateTeamMemberInput.shape.patch.describe("Profile fields to change") })

  // The record types publish_record and unpublish_record take: those of the sources that are on
  const publishable = (
    [
      { type: "project", enabled: on.projects, term: p, read: "admin_get_projects" },
      { type: "client", enabled: on.clients, term: c, read: "admin_get_clients" },
      { type: "team_member", enabled: on.teamMembers, term: t, read: "admin_get_team_members" },
      { type: "job_opening", enabled: on.jobOpenings, term: j, read: "admin_get_job_openings" },
    ] as const
  ).filter(({ enabled }) => enabled)
  const recordTypes = publishable.map(({ type }) => type) as [PublishableRecordType, ...PublishableRecordType[]]
  const publishableRecords = listed(
    publishable.map(({ type, term }) => `${term.aSingular}${type === "client" ? customer : ""}`),
    "or"
  )
  // Publishing a project leaves its related records as they are
  const related = [...(on.clients ? [`unpublished ${c.singular}`] : []), ...(on.teamMembers ? [`unpublished ${t.plural}`] : [])]
  const relatedChecks = [...(on.clients ? ["client.published"] : []), ...(on.teamMembers ? ["team_members"] : [])]
  const relatedNote =
    on.projects && related.length
      ? ` Related records are not published with it: ${possessive(p.aSingular)} ${listed(related)} stay hidden (check ${listed(relatedChecks)} in admin_get_project, and ask before publishing them too).`
      : ""

  const createProjectTool = defineTool({
    name: "create_project",
    title: `Create ${p.aSingular}`,
    description: `Create ${p.aSingular}${projectLinks.length ? `, optionally linked to ${listed(projectLinks)}` : ""}. Fails without writing anything if ${projectLinks.length ? "a reference does not exist, " : ""}the url_slug is taken, or ${p.aSingular} with the same name exists (confirm with the user, then set allow_duplicate_name). ${CREATE_LANGUAGE_NOTE} ${CREATE_NOTE} ${WRITE_NOTE}`,
    access: "write",
    input: createProjectSchema,
    output: mutationOutput("project", views.projectSchema),
    annotations: ADDITIVE_WRITE,
    run: async (ctx, input) => mutationResult("project", await createProject(ctx, input), views.project),
  })
  const createTeamMemberTool = defineTool({
    name: "create_team_member",
    title: `Create ${t.aSingular}`,
    description: `Create ${t.aSingular} profile${on.capabilities ? `, optionally with existing ${k.plural} and ratings from 1 to 5` : ""}. Work experience is added separately with add_work_experience. ${CREATE_LANGUAGE_NOTE} ${CREATE_NOTE} ${WRITE_NOTE}`,
    access: "write",
    input: createTeamMemberSchema,
    output: mutationOutput("team_member", views.teamMemberSchema),
    annotations: ADDITIVE_WRITE,
    run: async (ctx, input) => mutationResult("team_member", await createTeamMember(ctx, input), views.teamMember),
  })
  const createClientTool = defineTool({
    name: "create_client",
    title: `Create ${c.aSingular}${customer}`,
    description: `Create ${c.aSingular}, i.e. a customer ${businessName} works for. internal_webpage is staff-only and never shown publicly. ${CREATE_LANGUAGE_NOTE} ${CREATE_NOTE} ${WRITE_NOTE}`,
    access: "write",
    input: createClientInput,
    output: mutationOutput("client", views.clientSchema),
    annotations: ADDITIVE_WRITE,
    run: async (ctx, input) => mutationResult("client", await createClient(ctx, input), views.client),
  })
  const createCapabilityTool = defineTool({
    name: "create_capability",
    title: `Create ${k.aSingular}`,
    description: `Create ${k.aSingular}. Search admin_get_capabilities first: an existing ${k.singular} with the same name is returned as a conflict instead of a duplicate. ${CREATE_LANGUAGE_NOTE} ${WRITE_NOTE}`,
    access: "write",
    input: createCapabilityInput,
    output: mutationOutput("capability", views.capabilitySchema),
    annotations: ADDITIVE_WRITE,
    run: async (ctx, input) => mutationResult("capability", await createCapability(ctx, input), views.capability),
  })
  const createJobOpeningTool = defineTool({
    name: "create_job_opening",
    title: `Create ${j.aSingular}`,
    description: `Create ${j.aSingular}: a position ${businessName} recruits for, with its title, summary, description (markdown), location, work mode (REMOTE, HYBRID or ONSITE), posting date and an optional application link (without one, candidates are pointed to the careers page from the business settings). Fails without writing anything if the url_slug is taken. ${CREATE_LANGUAGE_NOTE} ${CREATE_NOTE} ${WRITE_NOTE}`,
    access: "write",
    input: createJobOpeningInput,
    output: mutationOutput("job_opening", teamJobOpeningSchema),
    annotations: ADDITIVE_WRITE,
    run: async (ctx, input) => mutationResult("job_opening", await createJobOpening(ctx, input)),
  })
  const updateProjectTool = defineTool({
    name: "update_project",
    title: `Update ${p.aSingular}`,
    description: `Change ${possessive(p.aSingular)} fields${on.clients ? ` or its ${c.singular}` : ""}. ${UPDATE_NOTE}${projectRelations.length ? ` ${capitalized(listed(projectRelations))} are changed with ${listed(projectLinkTools)}.` : ""} ${UPDATE_LANGUAGE_NOTE} ${WRITE_NOTE}`,
    access: "write",
    input: updateProjectSchema,
    output: mutationOutput("project", views.projectSchema),
    annotations: OVERWRITING_WRITE,
    run: async (ctx, input) => mutationResult("project", await updateProject(ctx, input), views.project),
  })
  const updateTeamMemberTool = defineTool({
    name: "update_team_member",
    title: `Update ${t.aSingular}`,
    description: `Change ${possessive(t.aSingular)} profile: name, job title, bio, education, highlights, webpage or slug. To revise text such as the bio, read the current value, integrate the user's facts while keeping the rest, show the result, then send the full new text. ${UPDATE_NOTE} ${UPDATE_LANGUAGE_NOTE} ${WRITE_NOTE}`,
    access: "write",
    input: updateTeamMemberSchema,
    output: mutationOutput("team_member", views.teamMemberSchema),
    annotations: OVERWRITING_WRITE,
    run: async (ctx, input) => mutationResult("team_member", await updateTeamMember(ctx, input), views.teamMember),
  })
  const updateClientTool = defineTool({
    name: "update_client",
    title: `Update ${c.aSingular}${customer}`,
    description: `Change ${possessive(c.aSingular)} fields. ${UPDATE_NOTE} ${UPDATE_LANGUAGE_NOTE} ${WRITE_NOTE}`,
    access: "write",
    input: updateClientInput,
    output: mutationOutput("client", views.clientSchema),
    annotations: OVERWRITING_WRITE,
    run: async (ctx, input) => mutationResult("client", await updateClient(ctx, input), views.client),
  })
  const updateJobOpeningTool = defineTool({
    name: "update_job_opening",
    title: `Update ${j.aSingular}`,
    description: `Change ${possessive(j.aSingular)} fields. To revise the description, read the current text, integrate the user's changes while keeping the rest, show the result, then send the full new text. Unpublish ${j.plural} that are filled with unpublish_record rather than editing them. ${UPDATE_NOTE} ${UPDATE_LANGUAGE_NOTE} ${WRITE_NOTE}`,
    access: "write",
    input: updateJobOpeningInput,
    output: mutationOutput("job_opening", teamJobOpeningSchema),
    annotations: OVERWRITING_WRITE,
    run: async (ctx, input) => mutationResult("job_opening", await updateJobOpening(ctx, input)),
  })
  const updateCapabilityTool = defineTool({
    name: "update_capability",
    title: `Update ${k.aSingular}`,
    description: `Change ${possessive(k.aSingular)} name or description. ${UPDATE_NOTE} ${UPDATE_LANGUAGE_NOTE} ${WRITE_NOTE}`,
    access: "write",
    input: updateCapabilityInput,
    output: mutationOutput("capability", views.capabilitySchema),
    annotations: OVERWRITING_WRITE,
    run: async (ctx, input) => mutationResult("capability", await updateCapability(ctx, input, views.capabilityUsers), views.capability),
  })
  const contributionTools = [
    defineTool({
      name: "add_team_member_to_project",
      title: `Add ${t.aSingular} to ${p.aSingular}`,
      description: `Add an existing ${possessive(t.singular)} contribution to ${p.aSingular}, keeping the other assignments. The contribution start_date is required and is not assumed from the ${p.singular} dates; ask the user. If the ${t.singular} is already on the ${p.singular} this returns a conflict with the current contribution: propose update_project_contribution instead. Does not create work experience. ${CREATE_LANGUAGE_NOTE} ${WRITE_NOTE}`,
      access: "write",
      input: addTeamMemberToProjectInput,
      output: mutationOutput("project", views.contributionResultSchema),
      annotations: ADDITIVE_WRITE,
      run: async (ctx, input) => mutationResult("project", await addTeamMemberToProject(ctx, input), views.linkedProject),
    }),
    defineTool({
      name: "update_project_contribution",
      title: `Update ${p.aSingular} contribution`,
      description: `Change the description or dates of ${possessive(t.aSingular)} existing contribution to ${p.aSingular}. ${UPDATE_NOTE} ${UPDATE_LANGUAGE_NOTE} ${WRITE_NOTE}`,
      access: "write",
      input: updateProjectContributionInput,
      output: mutationOutput("project", views.contributionResultSchema),
      annotations: OVERWRITING_WRITE,
      run: async (ctx, input) => mutationResult("project", await updateProjectContribution(ctx, input), views.linkedProject),
    }),
  ]
  const addCapabilitiesToProjectTool = defineTool({
    name: "add_capabilities_to_project",
    title: `Add ${k.plural} to ${p.aSingular}`,
    description: `Link existing ${k.plural} to ${p.aSingular}, keeping its other ${k.plural}; ${k.plural} already linked are left as they are. ${WRITE_NOTE}`,
    access: "write",
    input: addCapabilitiesToProjectInput,
    output: mutationOutput("project", views.addCapabilitiesResultSchema),
    annotations: ADDITIVE_WRITE,
    run: async (ctx, input) => mutationResult("project", await addCapabilitiesToProject(ctx, input), views.linkedProject),
  })
  const teamMemberCapabilityTools = [
    defineTool({
      name: "add_capabilities_to_team_member",
      title: `Add ${k.plural} to ${t.aSingular}`,
      description: `Add existing ${k.plural} with ratings from 1 to 5 to ${t.aSingular}, keeping the other ${k.plural}. ${capitalized(k.aSingular)} the ${t.singular} already has with another rating is a conflict (nothing is added): use update_team_member_capability to change a rating. Do not infer ratings: ask the user. ${WRITE_NOTE}`,
      access: "write",
      input: addCapabilitiesToTeamMemberInput,
      output: mutationOutput("team_member", views.addTeamMemberCapabilitiesResultSchema),
      annotations: ADDITIVE_WRITE,
      run: async (ctx, input) => mutationResult("team_member", await addCapabilitiesToTeamMember(ctx, input), views.linkedTeamMember),
    }),
    defineTool({
      name: "update_team_member_capability",
      title: `Change ${possessive(t.aSingular)} ${k.singular} rating`,
      description: `Change the rating (1 to 5) of ${k.aSingular} the ${t.singular} already has. Pass the ${k.singular} rating version from admin_get_team_member. ${WRITE_NOTE}`,
      access: "write",
      input: updateTeamMemberCapabilityInput,
      output: mutationOutput("team_member", views.teamMemberSchema),
      annotations: OVERWRITING_WRITE,
      run: async (ctx, input) => mutationResult("team_member", await updateTeamMemberCapability(ctx, input), views.teamMember),
    }),
  ]
  const experienceTools = [
    defineTool({
      name: "add_work_experience",
      title: "Add work experience",
      description: `Add an employment or experience entry to ${possessive(t.aSingular)} profile. Use it when there is no entry to update${on.projects ? `; never to record ${possessive(businessName)} ${p.singular} contributions` : ""}. ${CREATE_LANGUAGE_NOTE} ${WRITE_NOTE}`,
      access: "write",
      input: addWorkExperienceInput,
      output: mutationOutput("experience", teamExperienceSchema),
      annotations: ADDITIVE_WRITE,
      run: async (ctx, input) => mutationResult("experience", await addWorkExperience(ctx, input)),
    }),
    defineTool({
      name: "update_work_experience",
      title: "Update work experience",
      description: `Edit fields of one of the ${possessive(t.singular)} work experience entries (ids and versions from admin_get_work_experiences). To add information to the description, integrate it into the current text. Do not change company, position or dates unless the user asked. ${UPDATE_NOTE} ${UPDATE_LANGUAGE_NOTE} ${WRITE_NOTE}`,
      access: "write",
      input: updateWorkExperienceInput,
      output: mutationOutput("experience", teamExperienceSchema),
      annotations: OVERWRITING_WRITE,
      run: async (ctx, input) => mutationResult("experience", await updateWorkExperience(ctx, input)),
    }),
  ]
  // Only built while a record type is on, as an enum needs a value
  const publicationTools = () => {
    const recordFields = {
      record_type: z.enum(recordTypes).describe(
        `Type of the record: ${listed(
          publishable.map(({ type, term }) => (type.replace("_", " ") === term.singular ? type : `${type} (${term.singular})`)),
          "or"
        )}`
      ),
      id: uuidField(
        `Record id from ${listed(
          publishable.map(({ read }) => read),
          "or"
        )}`
      ),
    }
    return [
      defineTool({
        name: "publish_record",
        title: "Publish a record",
        description: `Publish ${publishableRecords}: approve it for external disclosure, so Lumi's website chatbot and the public get_* tools show it. Only call it when the user explicitly asks to publish, after showing them the record from an admin_ read; pass that read's version as expected_version.${relatedNote} A record already published is returned unchanged. ${WRITE_NOTE}`,
        access: "write",
        input: publishRecordInput.extend(recordFields),
        output: mutationOutput(recordTypes, publicationSchema),
        annotations: OVERWRITING_WRITE,
        run: async (ctx, input) => mutationResult(input.record_type, await publishRecord(ctx, input)),
      }),
      defineTool({
        name: "unpublish_record",
        title: "Unpublish a record",
        description: `Unpublish ${publishableRecords}: hide it from Lumi's website chatbot and the public get_* tools, including everywhere public records link to it. Staff still see it with the admin_ tools, and it can be published again.${on.teamMembers ? ` Unpublish ${t.plural} who left ${businessName}.` : ""}${on.jobOpenings ? ` Unpublish ${j.plural} once they are filled.` : ""} A record already unpublished is returned unchanged. ${WRITE_NOTE}`,
        access: "write",
        input: unpublishRecordInput.extend(recordFields),
        output: mutationOutput(recordTypes, publicationSchema),
        annotations: OVERWRITING_WRITE,
        run: async (ctx, input) => mutationResult(input.record_type, await unpublishRecord(ctx, input)),
      }),
    ]
  }

  // In a fixed order, without the writes of sources that are off. Capabilities are on only while team members or projects are
  return [
    ...(on.projects ? [createProjectTool] : []),
    ...(on.teamMembers ? [createTeamMemberTool] : []),
    ...(on.clients ? [createClientTool] : []),
    ...(on.capabilities ? [createCapabilityTool] : []),
    ...(on.jobOpenings ? [createJobOpeningTool] : []),
    ...(on.projects ? [updateProjectTool] : []),
    ...(on.teamMembers ? [updateTeamMemberTool] : []),
    ...(on.clients ? [updateClientTool] : []),
    ...(on.capabilities ? [updateCapabilityTool] : []),
    ...(on.jobOpenings ? [updateJobOpeningTool] : []),
    ...(on.projects && on.teamMembers ? contributionTools : []),
    ...(on.projects && on.capabilities ? [addCapabilitiesToProjectTool] : []),
    ...(on.teamMembers && on.capabilities ? teamMemberCapabilityTools : []),
    ...(on.teamMembers ? experienceTools : []),
    ...(publishable.length ? publicationTools() : []),
  ]
}
