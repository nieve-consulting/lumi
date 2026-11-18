import { getAdminUsage } from "@/apollo/sources/adminUsage"
import { Resolvers } from "@/generated/graphql"
import { GraphQLError } from "graphql"

import { toThread } from "../threads/resolvers"

const MAX_DAYS = 365
const RECENT_LEADS = 8
const RECENT_MCP_EVENTS = 10

// Most expensive first, the usage without a price last
const byCost = (a: { cost: number | null }, b: { cost: number | null }) =>
  a.cost === null ? (b.cost === null ? 0 : 1) : b.cost === null ? -1 : b.cost - a.cost

export const dashboardResolvers: Resolvers = {
  Query: {
    dashboard: async (_, { days }, context) => {
      if (!Number.isInteger(days) || days < 1 || days > MAX_DAYS) {
        throw new GraphQLError(`days must be between 1 and ${MAX_DAYS}`, { extensions: { code: "BAD_USER_INPUT" } })
      }

      const { db } = context.dataSources
      const range = await db.getDashboardRange(days)

      const [activity, conversationsCost, threadUsage, adminUsage, leads, content, websites, mcp] = await Promise.all([
        db.getDashboardActivity(range),
        db.getDashboardConversationsCost(range),
        db.getDashboardUsage(range),
        getAdminUsage(context.drizzle, range),
        db.getDashboardLeads(range, RECENT_LEADS),
        db.getDashboardContent(),
        db.getDashboardWebsites(),
        db.getDashboardMcpActivity(range, RECENT_MCP_EVENTS),
      ])

      // The admin's own calls count towards the usage, but not the conversations' cost. Their purposes are never a
      // conversation's, so the two usage lists share no purpose and model
      return {
        timeZone: range.timeZone,
        activity,
        conversationsCost,
        usage: [...threadUsage, ...adminUsage].sort(byCost),
        recentLeads: leads.map(toThread),
        content,
        websites: websites.map((website) => ({ ...website, lastProcessed: website.lastProcessed?.toISOString() })),
        mcp: {
          ...mcp,
          recent: mcp.recent.map((event) => ({ ...event, createdAt: event.createdAt.toISOString() })),
        },
      }
    },
  },
}
