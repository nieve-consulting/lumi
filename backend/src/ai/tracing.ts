import { CallbackHandler } from "@langfuse/langchain"
import { LangfuseSpanProcessor } from "@langfuse/otel"
import { NodeTracerProvider } from "@opentelemetry/sdk-trace-node"

// Tracing is optional: without both keys the agents run untraced. Langfuse reads LANGFUSE_PUBLIC_KEY, LANGFUSE_SECRET_KEY and LANGFUSE_BASE_URL itself
const enabled = Boolean(process.env.LANGFUSE_PUBLIC_KEY && process.env.LANGFUSE_SECRET_KEY)

// Lambda has no startup hook, so the tracer provider is registered when this module is first imported
const spanProcessor = enabled ? new LangfuseSpanProcessor({ environment: process.env.LANGFUSE_TRACING_ENVIRONMENT || "development" }) : undefined

if (spanProcessor) {
  new NodeTracerProvider({ spanProcessors: [spanProcessor] }).register()
}

// Langfuse callback handler for a graph run, or undefined when Langfuse is not configured
export function createTracingHandler(sessionId: string) {
  return spanProcessor ? new CallbackHandler({ sessionId }) : undefined
}

// Lambda freezes the execution environment as soon as the handler resolves, so this must be awaited before returning
export async function flushTraces() {
  await spanProcessor?.forceFlush().catch((error) => console.error("Error flushing traces", error))
}
