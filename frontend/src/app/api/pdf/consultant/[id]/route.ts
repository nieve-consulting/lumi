import { NextResponse, type NextRequest } from "next/server"

interface RequestParams {
  params: Promise<{ id: string }>
}

// The resume's former path, from before consultants became team members. Résumé links already shared, e.g. on the business
// website, keep working: they redirect permanently to /api/pdf/team-member/{id} with the same query (language, download)
export async function GET(req: NextRequest, { params }: RequestParams) {
  const { id } = await params
  const url = req.nextUrl.clone()
  url.pathname = `/api/pdf/team-member/${encodeURIComponent(id)}`
  return NextResponse.redirect(url, 308)
}
