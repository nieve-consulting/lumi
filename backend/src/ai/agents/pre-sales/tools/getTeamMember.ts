import { emitStatusUpdate } from "@/ai/utils"
import { listed, sourceTerms } from "@/knowledge"
import { publicContext } from "@/services/context"
import { COMPLETE_NESTED_LIMIT } from "@/services/pagination"
import { getPublicTeamMember, type PublicTeamMember } from "@/services/teamMembers"
import { currentContent } from "@/services/translations"
import { tool } from "@langchain/core/tools"
import type { KnowledgeSources } from "@lumi/shared-contracts/knowledge"
import type { Language } from "@lumi/shared-contracts/language"
import { z } from "zod"

import { cardIntro, runText } from "../text"
import type { PreSalesSources } from "../types"
import { modelLocalized } from "./localized"
import { recordIdSchema } from "./recordId"

// What the chat's team member card renders (card_type "team_member"). Data from a source that is off is left out: no project
// contributions while projects are off, no client on them while clients are off, no capabilities while capabilities are off.
// The chat builds the resume's link from the id, and shows it only while the installation offers resumes
export type TeamMemberCard = {
  id: string
  name: string
  bio: string | null
  webpage: string | null
  job_title: string
  education: string | null
  profile_photo_key: string | null
  capability_highlights: string | null
  experiences: {
    company: string
    position: string
    location: string
    start_date: string
    end_date?: string
    description: string | null
    logo_url?: string
    language: Language
    fallback_fields: string[]
  }[]
  project_contributions: { project: { id: string; name: string; client: { id: string; name: string } | null }; description: string | null }[]
  capabilities: { name: string; stars: number }[]
  profile_photo_url?: string
  // The language the content was returned in, which the admin's view of the conversation links the resume in
  language: Language
}

// Public team member record from the shared service, with complete relationship lists, in the shape the chat's team member
// card renders
async function getTeamMember({ drizzle }: PreSalesSources, id: string, language: Language, knowledge: KnowledgeSources) {
  const { record, media } = await getPublicTeamMember(publicContext(drizzle), id, {
    nestedLimit: COMPLETE_NESTED_LIMIT,
    language: currentContent(language),
  })

  const card: TeamMemberCard = {
    id: record.id,
    name: record.name,
    bio: record.bio,
    webpage: record.webpage,
    job_title: record.job_title,
    education: record.education,
    profile_photo_key: media.profilePhotoKey,
    capability_highlights: record.capability_highlights,
    experiences: record.experiences.items.map((experience) => ({
      ...experience,
      end_date: experience.end_date ?? undefined,
      logo_url: experience.logo_url ?? undefined,
    })),
    project_contributions: knowledge.projects
      ? record.project_contributions.items.map(({ project: { id, name, client }, description }) => ({
          project: { id, name, client: client && knowledge.clients ? { id: client.id, name: client.name } : null },
          description,
        }))
      : [],
    capabilities: knowledge.capabilities ? record.capabilities.items.map(({ name, stars }) => ({ name, stars })) : [],
    profile_photo_url: record.profile_photo_url ?? undefined,
    language: record.language,
  }

  return { card, record }
}

// The details the model keeps in the conversation, without the images and links that only the card uses, nor data from a
// source that is off. Each text comes with the language it was returned in and the fields that fell back to English, so the
// model knows which text is still in English
function toModelContent(teamMember: PublicTeamMember, knowledge: KnowledgeSources) {
  return JSON.stringify({
    id: teamMember.id,
    name: teamMember.name,
    job_title: teamMember.job_title,
    bio: teamMember.bio,
    webpage: teamMember.webpage,
    education: teamMember.education,
    capability_highlights: teamMember.capability_highlights,
    ...modelLocalized(teamMember),
    experiences: teamMember.experiences.items.map((experience) => ({
      company: experience.company,
      location: experience.location,
      position: experience.position,
      start_date: experience.start_date,
      end_date: experience.end_date ?? undefined,
      description: experience.description,
      ...modelLocalized(experience),
    })),
    ...(knowledge.projects && {
      project_contributions: teamMember.project_contributions.items.map(({ project, ...contribution }) => ({
        project: {
          id: project.id,
          name: project.name,
          ...(knowledge.clients && { client: project.client ? { id: project.client.id, name: project.client.name } : null }),
          ...modelLocalized(project),
        },
        description: contribution.description,
        ...modelLocalized(contribution),
      })),
    }),
    ...(knowledge.capabilities && {
      capabilities: teamMember.capabilities.items.map((capability) => ({
        name: capability.name,
        stars: capability.stars,
        ...modelLocalized(capability),
      })),
    }),
  })
}

// The description names the team members and what their details include by the installation's labels and sources, so it
// only changes when its settings do
export const getTeamMemberTool = (language: Language, sources: PreSalesSources, knowledge: KnowledgeSources) => {
  const terms = sourceTerms(knowledge)
  const details = [
    "job title",
    "bio",
    "education",
    "experience",
    ...(knowledge.capabilities ? [terms.capabilities.plural] : []),
    ...(knowledge.projects ? [`${terms.projects.singular} contributions`] : []),
  ]
  return tool(
    async (input, config) => {
      await emitStatusUpdate(runText(config).status.fetchingTeamMember(knowledge.labels.teamMembers))
      const { card, record } = await getTeamMember(sources, input.id, language, knowledge)
      return [
        toModelContent(record, knowledge),
        { cards: [{ card_type: "team_member", payload: card, id: input.id }], ...cardIntro(language, record.language, card.name) },
      ]
    },
    {
      name: "get_team_member",
      description: `Get the details of ${terms.teamMembers.aSingular} by providing their id and show them to the user as a card. Details include ${listed(details)}. The id can be obtained by calling the get_team_members function`,
      schema: z.object({
        id: recordIdSchema().describe(`The uuid of the ${terms.teamMembers.singular}`),
      }),
      responseFormat: "content_and_artifact",
    }
  )
}
