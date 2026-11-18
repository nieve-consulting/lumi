import { revalidatePath } from "next/cache"

import { fetchAgentsAdmin } from "@/lib/agentsAdmin"
import { adminRouteError } from "@/lib/auth/admin"

interface RequestParams {
  params: Promise<{ id: string }>
}

// Streams the conversation summary (newline-delimited JSON) from the agents API; the agents API saves it on the thread when it ends
export async function POST(_req: Request, { params }: RequestParams) {
  const error = await adminRouteError()
  if (error) {
    return error
  }

  const { id } = await params

  revalidatePath("/admin/conversations", "layout")

  const response = await fetchAgentsAdmin(`/pre-sales/threads/${encodeURIComponent(id)}/summary`, { method: "POST" })
  if (!response.ok) {
    console.error(`[Summary error]: ${response.status} ${await response.text()}`)
    return new Response(null, { status: 502 })
  }

  return new Response(response.body, {
    headers: { "Content-Type": response.headers.get("Content-Type") || "application/x-ndjson", "Cache-Control": "no-cache" },
  })
}
