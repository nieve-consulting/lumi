import { checkHealth } from "@/lib/health"

// Health of the web app and the services it needs, for container health checks and monitoring. Public and unauthenticated
// (the proxy's setup redirect and admin gating skip /api), so it answers only check names and states: the server's log says
// what's wrong (see lib/health.ts)
export const dynamic = "force-dynamic"

export async function GET() {
  const report = await checkHealth()
  return Response.json(report, { status: report.status === "ok" ? 200 : 503, headers: { "Cache-Control": "no-store" } })
}
