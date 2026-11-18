import { RunnableConfig } from "@langchain/core/runnables"
import type { StructuredToolInterface } from "@langchain/core/tools"
import type { KnowledgeSources } from "@lumi/shared-contracts/knowledge"

import { ConversationState, type AgentStateType } from "../state"
import { visitorLanguage } from "../text"
import type { PreSalesSources } from "../types"
import { getClientTool } from "./getClient"
import { getClientsTool } from "./getClients"
import { getCompanyInfoTool } from "./getCompanyInfo"
import { getJobOpeningTool } from "./getJobOpening"
import { getJobOpeningsTool } from "./getJobOpenings"
import { getProjectTool } from "./getProject"
import { getProjectsTool } from "./getProjects"
import { getTeamMemberTool } from "./getTeamMember"
import { getTeamMembersTool } from "./getTeamMembers"
import { readCurrentPageTool } from "./readCurrentPage"
import { webpageSearchTool } from "./webpageSearchTool"

// The tools of each structured source, which are only bound while the installation's knowledge sources (src/knowledge.ts)
// make it available. get_company_info, webpage_search and read_current_page are always available, although read_current_page
// is only allowed on turns with a page to read. Capabilities have no tool of their own: the team member and project tools
// return them while they are on
const TEAM_MEMBER_TOOLS = ["get_team_members", "get_team_member"]
const PROJECT_TOOLS = ["get_project", "get_projects"]
const CLIENT_TOOLS = ["get_client", "get_clients"]
const JOB_TOOLS = ["get_job_opening", "get_job_openings"]

// Every tool the installation's knowledge sources make available, in a fixed order. Tool definitions are part of OpenAI's
// cached prompt prefix, so the chat model is always bound to this list and the conversation state only restricts which tools
// it may call (see allowedToolNames). It only changes when the sources do, which src/knowledge.ts returns as the same object
// between edits. Some descriptions name the business, and the structured sources' name them by their labels and leave out
// the sources that are off, so they only change when the settings do
export function toolsFactory(
  state: AgentStateType,
  config: RunnableConfig,
  sources: PreSalesSources,
  businessName: string,
  knowledge: KnowledgeSources
): StructuredToolInterface[] {
  const language = visitorLanguage(state, config)
  return [
    ...(knowledge.teamMembers
      ? [getTeamMembersTool(language, sources, businessName, knowledge), getTeamMemberTool(language, sources, knowledge)]
      : []),
    ...(knowledge.projects ? [getProjectTool(language, sources, knowledge), getProjectsTool(language, sources, businessName, knowledge)] : []),
    ...(knowledge.clients ? [getClientTool(language, sources, knowledge), getClientsTool(language, sources, businessName, knowledge)] : []),
    getCompanyInfoTool(language, sources),
    webpageSearchTool(state, sources, businessName),
    // Bound on every turn, also without a page, so the tool definitions stay a cached prefix: allowedToolNames lets the model
    // call it only when the turn has one
    readCurrentPageTool(businessName),
    ...(knowledge.jobOpenings
      ? [getJobOpeningTool(language, sources, knowledge), getJobOpeningsTool(language, sources, businessName, knowledge)]
      : []),
  ]
}

// The names of the tools toolsFactory binds for the sources
function availableToolNames(knowledge: KnowledgeSources) {
  return new Set([
    ...(knowledge.teamMembers ? TEAM_MEMBER_TOOLS : []),
    ...(knowledge.projects ? PROJECT_TOOLS : []),
    ...(knowledge.clients ? CLIENT_TOOLS : []),
    "get_company_info",
    "webpage_search",
    "read_current_page",
    ...(knowledge.jobOpenings ? JOB_TOOLS : []),
  ])
}

// Tools the model may call in each conversation state, among those the sources make available. read_current_page is allowed
// where webpage_search is, and only when the turn has a page of one of the websites to read (its configuration's pageUrl)
export function allowedToolNames(conversationState: ConversationState, knowledge: KnowledgeSources, hasCurrentPage: boolean): string[] {
  const available = availableToolNames(knowledge)
  const allowed = (names: string[]) => names.filter((name) => available.has(name))
  const pageTools = hasCurrentPage ? ["read_current_page"] : []

  switch (conversationState) {
    case ConversationState.COMPANY_OVERVIEW:
      return allowed([...TEAM_MEMBER_TOOLS, ...PROJECT_TOOLS, ...CLIENT_TOOLS, "get_company_info", "webpage_search", ...pageTools])

    case ConversationState.CUSTOMER_NEEDS_GATHERING:
      return allowed(["webpage_search", ...pageTools])

    case ConversationState.HIRING_CANDIDATE:
      return allowed(["get_company_info", "webpage_search", ...pageTools, ...JOB_TOOLS])

    default:
      return []
  }
}
