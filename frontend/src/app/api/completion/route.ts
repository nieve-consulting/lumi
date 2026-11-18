import { openai } from "@ai-sdk/openai"
import { streamText } from "ai"

import { adminModelCall } from "@/lib/adminModelCall"
import { adminRouteAccess } from "@/lib/auth/admin"
import { WRITING_MODEL } from "@/lib/models"

// Writing assistant of the admin Markdown editor
export async function POST(req: Request) {
  const { user, error } = await adminRouteAccess()
  if (error) {
    return error
  }

  const { systemPrompt, text }: { systemPrompt: string; text: string } = await req.json()

  const result = adminModelCall({ purpose: "improve-text", model: WRITING_MODEL.model, adminEmail: user.email }, (options) =>
    streamText({
      model: openai(WRITING_MODEL.model),
      providerOptions: { openai: { reasoningEffort: WRITING_MODEL.reasoningEffort } },
      system: systemPrompt + ". Provide only the improved text without explanation",
      prompt: `Improve this article: ${text}`,
      // Discarding the proposal aborts the request: this stops the model call and ends its spans
      abortSignal: req.signal,
      ...options,
    })
  )

  return result.toTextStreamResponse()
}
