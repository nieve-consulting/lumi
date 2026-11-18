import { emitStatusUpdate } from "@/ai/utils"
import { sourceTerms } from "@/knowledge"
import { publicContext } from "@/services/context"
import { COMPLETE_LIST_LIMIT } from "@/services/pagination"
import { listPublicProjects } from "@/services/projects"
import { currentContent } from "@/services/translations"
import { tool } from "@langchain/core/tools"
import type { KnowledgeSources } from "@lumi/shared-contracts/knowledge"
import type { Language } from "@lumi/shared-contracts/language"

import { runText } from "../text"
import type { PreSalesSources } from "../types"
import { modelLocalized } from "./localized"

// The description names the business and the projects by the installation's labels, so it only changes when its settings do
export const getProjectsTool = (language: Language, { drizzle }: PreSalesSources, businessName: string, knowledge: KnowledgeSources) => {
  const { projects } = sourceTerms(knowledge)
  return tool(
    async (_input, config) => {
      await emitStatusUpdate(runText(config).status.fetchingProjects(knowledge.labels.projects))
      // The tool cannot page, so it gets every public project in one query
      const { items } = await listPublicProjects(publicContext(drizzle), { limit: COMPLETE_LIST_LIMIT }, { language: currentContent(language) })
      // Names are translated; the slug is the same in every language, to match a project named in another language. The
      // language and the fields that fell back to English tell the model which text is still in English
      return JSON.stringify(
        items.map((project) => ({
          id: project.id,
          name: project.name,
          url_slug: project.url_slug,
          summary: project.summary,
          ...modelLocalized(project, ["name", "summary"]),
        }))
      )
    },
    {
      name: "get_projects",
      description: `Get the list of ${projects.plural} that ${businessName} has or is working on. The list contains each ${projects.singular}'s basic information and their id to get more details. Names are in the user's language; the url_slug is the same in every language, so use it to find ${projects.aSingular} the user names in another language`,
    }
  )
}
