export const config = {
  agents: {
    // Agents API as the browser reaches it (API Gateway REST API, AgentsApiEndpoint output), inlined at build time. May be a
    // path on the app's own origin, e.g. /agents behind the self-hosted reverse proxy, so only browser code fetches it: the
    // server uses serverConfig.agentsEndpoint. Locally: pnpm -C backend dev:agents
    uri: process.env.NEXT_PUBLIC_AGENTS_ENDPOINT || "http://localhost:4200/agents",
  },
}
