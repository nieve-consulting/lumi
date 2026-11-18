import { emitStatusUpdate } from "@/ai/utils"
import { requireBusinessConfig } from "@/business"
import { getPublicCompany } from "@/services/company"
import { publicContext } from "@/services/context"
import { ServiceError } from "@/services/errors"
import { currentContent } from "@/services/translations"
import { tool } from "@langchain/core/tools"
import type { Language } from "@lumi/shared-contracts/language"

import { runText } from "../text"
import type { PreSalesSources } from "../types"
import { modelLocalized } from "./localized"

export const getCompanyInfoTool = (language: Language, { drizzle }: PreSalesSources) =>
  tool(
    async (_input, config) => {
      await emitStatusUpdate(runText(config).status.fetchingCompanyInfo)
      // The same public company information as the anonymous MCP read, with the language it was returned in
      let result: Awaited<ReturnType<typeof getPublicCompany>>
      try {
        result = await getPublicCompany(publicContext(drizzle), { language: currentContent(language) })
      } catch (error) {
        if (!(error instanceof ServiceError && error.code === "not_found")) throw error
        // Until an admin writes the company information, the contact details of the business settings stand in for it, so
        // the model can still say how to reach the team rather than that a tool failed
        const { businessName, websiteUrl, contactUrl, contactEmail, contactPhone } = (await requireBusinessConfig(drizzle)).public
        return JSON.stringify({
          name: businessName,
          webpage: websiteUrl ?? null,
          contact_page: contactUrl ?? null,
          email: contactEmail ?? null,
          phone: contactPhone ?? null,
          note: "No founding story, mission, vision, values or location have been written for the company yet.",
        })
      }
      const { language: returned, fallback_fields, ...company } = result
      return JSON.stringify({ ...company, ...modelLocalized({ language: returned, fallback_fields }) })
    },
    {
      name: "get_company_info",
      description: "Get details about the company that you represent such as contact information, founding story, mission, vision and values",
    }
  )
