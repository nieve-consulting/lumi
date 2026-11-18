import type { WidgetBusinessResponse } from "@lumi/shared-contracts/business"

import { getBusiness } from "@/lib/business"

// What the widget's launcher needs from the business settings, fetched when the widget loads on any site. Nothing else of
// the settings: the chat page in the widget's iframe reads the rest itself

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
}

export async function GET() {
  let business
  try {
    business = await getBusiness()
  } catch (error) {
    console.error("Couldn't read the business settings for the widget", error)
    return Response.json({ error: "The settings are unavailable" }, { status: 503, headers: { ...CORS_HEADERS, "Cache-Control": "no-store" } })
  }

  const body: WidgetBusinessResponse = business
    ? {
        configured: true,
        assistantName: business.assistantName,
        defaultLanguage: business.defaultLanguage,
        ...(business.primaryColor && { primaryColor: business.primaryColor }),
      }
    : { configured: false }
  return Response.json(body, {
    headers: {
      ...CORS_HEADERS,
      // Not set up is about to change, so CDNs don't keep it past the onboarding wizard
      "Cache-Control": body.configured ? "public, s-maxage=60, stale-while-revalidate=300" : "no-store",
    },
  })
}

export function OPTIONS() {
  return new Response(null, { status: 204, headers: { ...CORS_HEADERS, "Access-Control-Max-Age": "86400" } })
}
