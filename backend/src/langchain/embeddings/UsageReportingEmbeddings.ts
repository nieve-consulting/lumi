import { EMBEDDING_USAGE_EVENT, type EmbeddingUsage } from "@/ai/usage"
import { dispatchCustomEvent } from "@langchain/core/callbacks/dispatch"
import { AsyncLocalStorageProviderSingleton } from "@langchain/core/singletons"
import { OpenAIEmbeddings, type OpenAIClient } from "@langchain/openai"

type ReportUsage = (usage: EmbeddingUsage) => void | Promise<void>

// Reports the usage of a request made inside a run (the agent's website search) so the usage handler counts it towards the
// conversation. Requests made outside a run are not reported
async function dispatchInRun(usage: EmbeddingUsage) {
  if (AsyncLocalStorageProviderSingleton.getRunnableConfig()) {
    await dispatchCustomEvent(EMBEDDING_USAGE_EVENT, usage)
  }
}

// Reports the input tokens of each request, as embedding models do not report their usage through the model callbacks. Callers
// outside a run that record their usage themselves (the website crawler) pass their own reportUsage
export class UsageReportingEmbeddings extends OpenAIEmbeddings {
  private readonly reportUsage: ReportUsage

  constructor(fields: ConstructorParameters<typeof OpenAIEmbeddings>[0], reportUsage: ReportUsage = dispatchInRun) {
    super(fields)
    this.reportUsage = reportUsage
  }

  protected override async embeddingWithRetry(request: OpenAIClient.EmbeddingCreateParams) {
    const response = await super.embeddingWithRetry(request)
    await this.reportUsage({ model: request.model, inputTokens: response.usage.prompt_tokens })
    return response
  }
}
