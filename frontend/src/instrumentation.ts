// Runs once when the server starts. Tracing uses Node.js APIs, so it is not loaded in the edge runtime
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { registerTracing } = await import("@/lib/tracing")
    registerTracing()
  }
}
