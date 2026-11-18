import { Client } from "@/generated/graphql"
import type { Language } from "@lumi/shared-contracts/language"

export type ClientMapper = Client & {
  // Language the query requested, which the client's projects are read in (see ProjectMapper)
  requested_language: Language
}
