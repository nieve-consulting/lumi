import { Resolvers, UpdateCheck } from "@/generated/graphql"
import { lumiVersionState } from "@/services/updateCheck"

const CHECKS = { OK: UpdateCheck.Ok, OFF: UpdateCheck.Off, UNAVAILABLE: UpdateCheck.Unavailable } as const

// For admins and internal keys only: read-only keys are refused, as lumiVersion isn't one of READ_ONLY_QUERIES
// (src/apollo/access.ts). The admin interface asks on every page, which the service answers from its cache after the first
export const installationResolvers: Resolvers = {
  Query: {
    lumiVersion: async () => {
      const { current, check, latest, updateAvailable } = await lumiVersionState()
      return { current, check: CHECKS[check], latest, updateAvailable }
    },
  },
}
