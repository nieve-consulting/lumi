import { after } from "next/server"
import { OpenTelemetry } from "@ai-sdk/otel"
import { LangfuseSpanProcessor } from "@langfuse/otel"
import { propagateAttributes, setLangfuseTracerProvider } from "@langfuse/tracing"
import { context } from "@opentelemetry/api"
import { AsyncLocalStorageContextManager } from "@opentelemetry/context-async-hooks"
import { NodeTracerProvider } from "@opentelemetry/sdk-trace-node"
import { registerTelemetry, type LanguageModelUsage } from "ai"

// Kept on globalThis because Next.js evaluates instrumentation.ts and the route handlers in separate bundles
const processState = globalThis as typeof globalThis & { lumiTracerProvider?: NodeTracerProvider }

// Registers Langfuse tracing for the AI SDK calls, once per process from instrumentation.ts
// Tracing is optional: without both keys the model calls run untraced. Langfuse reads LANGFUSE_PUBLIC_KEY, LANGFUSE_SECRET_KEY and LANGFUSE_BASE_URL itself
export function registerTracing() {
  if (!process.env.LANGFUSE_PUBLIC_KEY || !process.env.LANGFUSE_SECRET_KEY || processState.lumiTracerProvider) {
    return
  }

  const spanProcessor = new LangfuseSpanProcessor({ environment: process.env.LANGFUSE_TRACING_ENVIRONMENT || "development" })
  const provider = new NodeTracerProvider({ spanProcessors: [spanProcessor] })
  processState.lumiTracerProvider = provider

  // The provider is not registered globally: that would turn on Next.js's own spans for every request and extract
  // trace context and Langfuse baggage from incoming headers. Only the context manager is global, so the attributes
  // set by propagateAttributes reach the spans created asynchronously by the AI SDK
  context.setGlobalContextManager(new AsyncLocalStorageContextManager().enable())
  setLangfuseTracerProvider(provider)
  registerTelemetry(new OpenTelemetry({ tracer: provider.getTracer("gen_ai") }))
}

export interface ModelCallTrace {
  // Trace name, also the AI SDK telemetry function id
  name: string
  // Who the call was made for, e.g. the admin's email
  userId?: string
  // Groups related calls' traces, e.g. a bulk translation run
  sessionId?: string
  // String values of at most 200 characters, as Langfuse drops others
  metadata?: Record<string, string>
}

// The streamText options the callback passes on: the AI SDK telemetry settings, and the abort callback that keeps the usage
// of the steps finished before an abort
export interface ModelCallOptions {
  telemetry: { functionId: string }
  onAbort: (event: { steps: readonly { usage: LanguageModelUsage }[] }) => void
}

// Runs a streaming AI SDK call (streamText) as a Langfuse trace. Once the call has ended, `onUsage` receives its usage: the
// whole call's when it finished, the steps' finished before an abort (none for a call aborted while answering), none when
// it failed. It runs after the response, and must not throw
export function traceModelCall<T extends { consumeStream(): PromiseLike<void>; usage: PromiseLike<LanguageModelUsage> }>(
  { name, userId, sessionId, metadata }: ModelCallTrace,
  fn: (options: ModelCallOptions) => T,
  onUsage?: (usage: LanguageModelUsage[]) => Promise<void>
): T {
  let abortedUsage: LanguageModelUsage[] = []
  const options: ModelCallOptions = {
    telemetry: { functionId: name },
    onAbort: ({ steps }) => {
      abortedUsage = steps.map((step) => step.usage)
    },
  }
  // The trace's attributes are context attributes in Langfuse v5, applied to every span created inside the callback
  const result = propagateAttributes({ traceName: name, userId, sessionId, metadata }, () => fn(options))

  // Vercel freezes the function once the response is sent, so the spans are exported after the response has finished.
  // An aborted call can end its spans after that: consuming the rest of the stream (it never throws) waits until the
  // call has finished, aborted or failed, and so until all its spans have ended and its usage is known
  after(async () => {
    await result.consumeStream()
    // An aborted or failed call rejects its usage
    const usage = await Promise.resolve(result.usage).then(
      (usage) => [usage],
      () => abortedUsage
    )
    await Promise.all([onUsage?.(usage), flushTraces()])
  })

  return result
}

async function flushTraces() {
  await processState.lumiTracerProvider?.forceFlush().catch((error: unknown) => console.error("Error flushing traces", error))
}
