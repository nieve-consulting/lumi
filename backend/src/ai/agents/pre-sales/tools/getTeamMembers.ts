import { emitStatusUpdate } from "@/ai/utils"
import { possessive } from "@/business"
import { sourceTerms } from "@/knowledge"
import { publicContext } from "@/services/context"
import { COMPLETE_LIST_LIMIT } from "@/services/pagination"
import { listPublicTeamMembers, publicProjectIdsByTeamMember } from "@/services/teamMembers"
import { currentContent } from "@/services/translations"
import { tool } from "@langchain/core/tools"
import type { KnowledgeSources } from "@lumi/shared-contracts/knowledge"
import type { Language } from "@lumi/shared-contracts/language"

import { runText } from "../text"
import type { PreSalesSources } from "../types"
import { modelLocalized } from "./localized"

async function getTeamMembers({ drizzle }: PreSalesSources, language: Language, knowledge: KnowledgeSources) {
  const ctx = publicContext(drizzle)
  // The tool cannot page, so it gets every public team member in one query
  const { items } = await listPublicTeamMembers(ctx, { limit: COMPLETE_LIST_LIMIT }, { language: currentContent(language) })
  // Their projects only while projects are on
  const projectIds = knowledge.projects
    ? await publicProjectIdsByTeamMember(
        ctx,
        items.map(({ id }) => id)
      )
    : undefined

  // The language and the fields that fell back to English tell the model which text is still in English
  return items.map((teamMember) => ({
    id: teamMember.id,
    name: teamMember.name,
    job_title: teamMember.job_title,
    ...modelLocalized(teamMember, ["job_title"]),
    ...(projectIds && {
      project_contributions: (projectIds.get(teamMember.id) ?? []).map((projectId) => ({ project: { id: projectId } })),
    }),
  }))
}

// The description names the business and the team members by the installation's labels, so it only changes when its settings do
export const getTeamMembersTool = (language: Language, sources: PreSalesSources, businessName: string, knowledge: KnowledgeSources) => {
  const { teamMembers } = sourceTerms(knowledge)
  return tool(
    async (_input, config) => {
      await emitStatusUpdate(runText(config).status.fetchingTeamMembers(knowledge.labels.teamMembers))
      return JSON.stringify({ type: "object", content: await getTeamMembers(sources, language, knowledge) })
    },
    {
      name: "get_team_members",
      description: `Get the list of ${teamMembers.plural} on ${possessive(businessName)} team. The list contains each ${teamMembers.singular}'s basic information and their id to get more details, save the id to be used with the get_team_member function`,
    }
  )
}
