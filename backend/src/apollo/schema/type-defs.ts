import { mergeTypeDefs } from "@graphql-tools/merge"

import { adminAccountsTypeDefs } from "./adminAccounts/types.gql"
import { adminUsageTypeDefs } from "./adminUsage/types.gql"
import { apiKeysTypeDefs } from "./apiKeys/types.gql"
import { appointmentsTypeDefs } from "./appointments/types.gql"
import { businessTypeDefs } from "./business/types.gql"
import { capabilitiesTypeDefs } from "./capabilities/types.gql"
import { clientsTypeDefs } from "./clients/types.gql"
import { companyTypeDefs } from "./company/types.gql"
import { dashboardTypeDefs } from "./dashboard/types.gql"
import { experienceTypeDefs } from "./experience/types.gql"
import { handoffTypeDefs } from "./handoff/types.gql"
import { jobOpeningsTypeDefs } from "./jobOpenings/types.gql"
import { knowledgeTypeDefs } from "./knowledge/types.gql"
import { projectsTypeDefs } from "./projects/types.gql"
import { resumeTypeDefs } from "./resume/types.gql"
import { teamMembersTypeDefs } from "./teamMembers/types.gql"
import { threadsTypeDefs } from "./threads/types.gql"
import { translationDraftsTypeDefs } from "./translationDrafts/types.gql"
import { uploadsTypeDefs } from "./uploads/types.gql"
import { websitesTypeDefs } from "./websites/types.gql"

/**
 * The whole SDL the server serves. Kept apart from the resolvers so codegen can load it (`codegen.ts`) without the data
 * sources and settings the resolvers pull in.
 */
export const typeDefs = mergeTypeDefs([
  clientsTypeDefs,
  capabilitiesTypeDefs,
  teamMembersTypeDefs,
  projectsTypeDefs,
  experienceTypeDefs,
  uploadsTypeDefs,
  companyTypeDefs,
  threadsTypeDefs,
  websitesTypeDefs,
  appointmentsTypeDefs,
  dashboardTypeDefs,
  translationDraftsTypeDefs,
  adminUsageTypeDefs,
  businessTypeDefs,
  adminAccountsTypeDefs,
  handoffTypeDefs,
  knowledgeTypeDefs,
  jobOpeningsTypeDefs,
  apiKeysTypeDefs,
  resumeTypeDefs,
])
