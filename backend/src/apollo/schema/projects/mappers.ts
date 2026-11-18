import { Project } from "@/generated/graphql"
import type { Language } from "@lumi/shared-contracts/language"

export type ProjectMapper = Project & {
  client_id: string | null
  // Language the query requested, which the project's nested records are read in. The project's own `language` is the one
  // its content was returned in, English when it has no translation in the requested one or an outdated one
  requested_language: Language
}
