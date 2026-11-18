import { emitStatusUpdate } from "@/ai/utils"
import { listed, sourceTerms } from "@/knowledge"
import { publicContext } from "@/services/context"
import { COMPLETE_NESTED_LIMIT } from "@/services/pagination"
import { getPublicProject, type PublicProject } from "@/services/projects"
import { currentContent } from "@/services/translations"
import { tool } from "@langchain/core/tools"
import type { KnowledgeSources } from "@lumi/shared-contracts/knowledge"
import type { Language } from "@lumi/shared-contracts/language"
import { z } from "zod"

import { cardIntro, runText } from "../text"
import type { PreSalesSources } from "../types"
import { modelLocalized } from "./localized"
import { recordIdSchema } from "./recordId"

// What the chat's project card renders (card_type "project"). Data from a source that is off is left out: no client while
// clients are off, no team members while team members are off, no capabilities while capabilities are off
export type ProjectCard = {
  id: string
  name: string
  summary: string | null
  webpage: string | null
  location: "REMOTE" | "HYBRID" | "ONSITE"
  start_date: string
  end_date?: string
  description: string | null
  image_key: string | null
  // Null for an undisclosed client; left out while clients are off, so the card doesn't present them as undisclosed
  client?: { id: string; name: string; logo_key: string | null } | null
  team_members: { team_member: { id: string; name: string }; description: string | null }[]
  capabilities: { name: string }[]
}

// Public project record from the shared service, with complete relationship lists, in the shape the chat's project card renders
async function getProject({ drizzle }: PreSalesSources, id: string, language: Language, knowledge: KnowledgeSources) {
  const { record, media } = await getPublicProject(publicContext(drizzle), id, {
    nestedLimit: COMPLETE_NESTED_LIMIT,
    language: currentContent(language),
  })

  const card: ProjectCard = {
    id: record.id,
    name: record.name,
    summary: record.summary,
    webpage: record.webpage,
    location: record.location,
    start_date: record.start_date,
    end_date: record.end_date ?? undefined,
    description: record.description,
    image_key: media.imageKey,
    ...(knowledge.clients && {
      client: record.client ? { id: record.client.id, name: record.client.name, logo_key: media.clientLogoKey } : null,
    }),
    team_members: knowledge.teamMembers
      ? record.team_members.items.map(({ team_member, description }) => ({
          team_member: { id: team_member.id, name: team_member.name },
          description,
        }))
      : [],
    capabilities: knowledge.capabilities ? record.capabilities.items.map(({ name }) => ({ name })) : [],
  }

  return { card, record }
}

// The details the model keeps in the conversation, without the images that only the card uses, nor data from a source that
// is off. Each text comes with the language it was returned in and the fields that fell back to English, so the model knows
// which text is still in English
function toModelContent(project: PublicProject, knowledge: KnowledgeSources) {
  return JSON.stringify({
    id: project.id,
    name: project.name,
    summary: project.summary,
    description: project.description,
    webpage: project.webpage,
    location: project.location,
    start_date: project.start_date,
    end_date: project.end_date ?? undefined,
    ...modelLocalized(project, ["name", "summary", "description"]),
    ...(knowledge.clients && { client: project.client ? { id: project.client.id, name: project.client.name } : null }),
    ...(knowledge.teamMembers && {
      team_members: project.team_members.items.map((contribution) => ({
        team_member: { id: contribution.team_member.id, name: contribution.team_member.name },
        description: contribution.description,
        ...modelLocalized(contribution),
      })),
    }),
    ...(knowledge.capabilities && {
      capabilities: project.capabilities.items.map((capability) => ({ name: capability.name, ...modelLocalized(capability) })),
    }),
  })
}

// The description names the projects and what their details include by the installation's labels and sources, so it only
// changes when its settings do
export const getProjectTool = (language: Language, sources: PreSalesSources, knowledge: KnowledgeSources) => {
  const terms = sourceTerms(knowledge)
  const details = [
    "name",
    ...(knowledge.capabilities ? [terms.capabilities.plural] : []),
    "description",
    "dates",
    ...(knowledge.clients ? [terms.clients.singular] : []),
    ...(knowledge.teamMembers ? [`the ${terms.teamMembers.plural} who worked on it`] : []),
  ]
  return tool(
    async (input, config) => {
      await emitStatusUpdate(runText(config).status.fetchingProject(knowledge.labels.projects))
      const { card, record } = await getProject(sources, input.id, language, knowledge)
      return [
        toModelContent(record, knowledge),
        { cards: [{ card_type: "project", payload: card, id: input.id }], ...cardIntro(language, record.language, card.name) },
      ]
    },
    {
      name: "get_project",
      description: `Get the details on the ${terms.projects.singular} and show them to the user as a card. Details include ${listed(details)}.`,
      schema: z.object({
        id: recordIdSchema().describe(
          `The ID of the ${terms.projects.singular} to get details on. This ID can be retrieved from the get_projects function.`
        ),
      }),
      responseFormat: "content_and_artifact",
    }
  )
}
