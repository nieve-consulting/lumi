export const dashboardTypeDefs = /* GraphQL */ `
  type Query {
    "Admin dashboard for the last days (1 to 365, today included), counted in the appointment settings time zone"
    dashboard(days: Int!): Dashboard!
  }

  type Dashboard {
    "IANA time zone the days are counted in"
    timeZone: String!
    "One entry per day of the range, oldest first, including the days without activity"
    activity: [DashboardDay!]!
    "Total cost in USD of the conversations started in the range, their calls made since included. Null when one of them has calls without a price"
    conversationsCost: Float
    "Token usage and cost of the range's model calls per purpose and model, most expensive first: the conversations' and the admin's own (record translation and the editor's writing assistant)"
    usage: [ModelUsage!]!
    "Latest conversations of the range that left an email or a phone number, newest first"
    recentLeads: [Thread!]!
    content: DashboardContent!
    websites: [DashboardWebsite!]!
    mcp: DashboardMcp!
  }

  type DashboardDay {
    "Day in the dashboard time zone, as YYYY-MM-DD"
    date: String!
    "Conversations started that day"
    conversations: Int!
    "Conversations started that day that left an email or a phone number"
    leads: Int!
    "Conversations started that day that booked a meeting"
    meetings: Int!
    "Cost in USD of that day's priced model calls, the conversations' and the admin's own"
    cost: Float!
    "Model calls of that day without a price, the conversations' and the admin's own: while there are any, the cost is incomplete"
    unpricedCalls: Int!
  }

  type PublishedCount {
    total: Int!
    published: Int!
  }

  type DashboardContent {
    teamMembers: PublishedCount!
    projects: PublishedCount!
    clients: PublishedCount!
    capabilities: Int!
    jobOpenings: PublishedCount!
  }

  type DashboardWebsite {
    id: ID!
    name: String!
    url: String!
    "Pages Lumi can search: those processed by a crawl, including pages since removed from the sitemap"
    pages: Int!
    "When the website was last crawled. Null when it was never crawled"
    lastProcessed: String
  }

  type DashboardMcp {
    "MCP writes of the range"
    calls: Int!
    "MCP writes of the range that failed"
    errors: Int!
    "Latest MCP writes of the range, newest first"
    recent: [McpAuditEvent!]!
  }

  type McpAuditEvent {
    id: ID!
    createdAt: String!
    actorEmail: String!
    tool: String!
    recordType: String
    recordId: String
    "success or the error code"
    outcome: String!
  }
`
