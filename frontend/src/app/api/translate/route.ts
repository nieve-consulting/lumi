import { adminRouteAccess } from "@/lib/auth/admin"
import { translateFields, translateRequestError, translateRequestSchema } from "@/lib/translation"
import { TRANSLATION_FAILED } from "@/lib/translationMessages"

// Translates a record's content between languages for the admin forms, which fill the form with it for the team to review.
// Nothing is saved here

export type { TranslateRequest } from "@/lib/translation"
// The translations, in the order of the request's fields
export type TranslateResponse = { translations: string[] } | { error: string }

// The response waits for the whole translation, which takes minutes for the longest records
export const maxDuration = 300

export async function POST(req: Request) {
  const { user, error } = await adminRouteAccess()
  if (error) {
    return error
  }

  const body: unknown = await req.json().catch(() => undefined)
  const parsed = translateRequestSchema.safeParse(body)
  if (!parsed.success) {
    return Response.json({ error: translateRequestError(parsed.error, body) } satisfies TranslateResponse, { status: 400 })
  }

  try {
    // Leaving the form aborts the request, which stops the model call
    const translations = await translateFields(parsed.data, req.signal, { adminEmail: user.email })
    return Response.json({ translations } satisfies TranslateResponse)
  } catch (e) {
    // Switching language or leaving the form aborts the request: nobody is waiting for the answer, and nothing failed
    if (!req.signal.aborted) console.error("Error translating record", e)
    return Response.json({ error: TRANSLATION_FAILED } satisfies TranslateResponse, { status: 502 })
  }
}
