import { emitStatusUpdate } from "@/ai/utils"
import { sourceTerms } from "@/knowledge"
import { publicContext } from "@/services/context"
import { getPublicJobOpening, type PublicJobOpening } from "@/services/jobOpenings"
import { currentContent } from "@/services/translations"
import { tool } from "@langchain/core/tools"
import type { JobOpeningCard, KnowledgeSources } from "@lumi/shared-contracts/knowledge"
import type { Language } from "@lumi/shared-contracts/language"
import { z } from "zod"

import { cardIntro, runText } from "../text"
import type { PreSalesSources } from "../types"
import { modelLocalized } from "./localized"
import { recordIdSchema } from "./recordId"

// A published job opening in the shape the chat's job opening card renders (card_type "job_opening"). The card links to its
// application link, or to the careers page from the business settings without one
function toCard(jobOpening: PublicJobOpening): JobOpeningCard {
  return {
    id: jobOpening.id,
    title: jobOpening.title,
    summary: jobOpening.summary,
    description: jobOpening.description,
    location: jobOpening.location,
    work_mode: jobOpening.work_mode,
    application_url: jobOpening.application_url,
    posted_at: jobOpening.posted_at,
  }
}

// The details the model keeps in the conversation. The text comes with the language it was returned in and the fields that
// fell back to English, so the model knows which text is still in English
function toModelContent(jobOpening: PublicJobOpening) {
  return JSON.stringify({ ...toCard(jobOpening), ...modelLocalized(jobOpening) })
}

// The description names the job openings by the installation's labels, so it only changes when its settings do
export const getJobOpeningTool = (language: Language, { drizzle }: PreSalesSources, knowledge: KnowledgeSources) => {
  const { jobOpenings } = sourceTerms(knowledge)
  return tool(
    async (input, config) => {
      await emitStatusUpdate(runText(config).status.fetchingJobOpening(knowledge.labels.jobOpenings))
      const record = await getPublicJobOpening(publicContext(drizzle), input.id, { language: currentContent(language) })
      const card = toCard(record)
      return [
        toModelContent(record),
        { cards: [{ card_type: "job_opening", payload: card, id: input.id }], ...cardIntro(language, record.language, card.title) },
      ]
    },
    {
      name: "get_job_opening",
      description: `Get the details on ${jobOpenings.aSingular} and show them to the user as a card. Details include the full description, location, work mode, posting date and the link where candidates apply.`,
      schema: z.object({
        id: recordIdSchema().describe(
          `The ID of the ${jobOpenings.singular} to get details on. This ID can be retrieved from the get_job_openings tool.`
        ),
      }),
      responseFormat: "content_and_artifact",
    }
  )
}
