import { emitStatusUpdate } from "@/ai/utils"
import { sourceTerms } from "@/knowledge"
import { publicContext } from "@/services/context"
import { listPublicJobOpenings } from "@/services/jobOpenings"
import { COMPLETE_LIST_LIMIT } from "@/services/pagination"
import { currentContent } from "@/services/translations"
import { tool } from "@langchain/core/tools"
import type { KnowledgeSources } from "@lumi/shared-contracts/knowledge"
import type { Language } from "@lumi/shared-contracts/language"

import { runText } from "../text"
import type { PreSalesSources } from "../types"
import { modelLocalized } from "./localized"

// The published job openings, most recently posted first. The description names the business and the job openings by the
// installation's labels, so it only changes when its settings do
export const getJobOpeningsTool = (language: Language, { drizzle }: PreSalesSources, businessName: string, knowledge: KnowledgeSources) => {
  const { jobOpenings } = sourceTerms(knowledge)
  return tool(
    async (_input, config) => {
      await emitStatusUpdate(runText(config).status.fetchingJobOpenings(knowledge.labels.jobOpenings))
      // The tool cannot page, so it gets every public job opening in one query
      const { items } = await listPublicJobOpenings(publicContext(drizzle), { limit: COMPLETE_LIST_LIMIT }, { language: currentContent(language) })
      // The language and the fields that fell back to English tell the model which text is still in English
      return JSON.stringify(
        items.map((jobOpening) => ({
          id: jobOpening.id,
          title: jobOpening.title,
          summary: jobOpening.summary,
          location: jobOpening.location,
          work_mode: jobOpening.work_mode,
          posted_at: jobOpening.posted_at,
          ...modelLocalized(jobOpening, ["title", "summary"]),
        }))
      )
    },
    {
      name: "get_job_openings",
      description: `Get the list of ${jobOpenings.plural} ${businessName} is recruiting for, most recently posted first. The list contains each ${jobOpenings.singular}'s title, summary, location, work mode (REMOTE, HYBRID or ONSITE) and posting date, and its id to get more details using the get_job_opening tool. An empty list means ${businessName} has no ${jobOpenings.plural} published`,
    }
  )
}
