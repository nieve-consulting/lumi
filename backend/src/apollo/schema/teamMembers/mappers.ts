import { TeamMember } from "@/generated/graphql"
import type { Language } from "@lumi/shared-contracts/language"

export type TeamMemberMapper = TeamMember & {
  // Language the query requested, which the team member's nested records are read in (see ProjectMapper)
  requested_language: Language
}
