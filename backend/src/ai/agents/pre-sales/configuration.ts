import { RunnableConfig } from "@langchain/core/runnables"
import { Annotation } from "@langchain/langgraph"
import { DEFAULT_LANGUAGE, matchLanguage, type Language } from "@lumi/shared-contracts/language"

// Per-turn values only. The business the assistant represents is the installation's (see src/business.ts), which the nodes
// read themselves so the system prompt stays the same for every call between edits
export const ConfigurationSchema = Annotation.Root({
  /**
   * The thread id to be used by the agent.
   */
  thread_id: Annotation<string>,

  /**
   * The title of the page where the widget is embedded.
   */
  pageTitle: Annotation<string | undefined>,

  /**
   * The page the visitor is on during this turn, without its query, which read_current_page reads. Only set when the
   * embedded chat sent it (see readablePageUrl) and it is on the business website or a crawled website (see runTurn)
   */
  pageUrl: Annotation<string | undefined>,

  /**
   * The chat's language, for the fixed text written during the run such as status updates. Replies follow the visitor's language.
   */
  language: Annotation<Language>,
})

export function ensureConfiguration(config: RunnableConfig): typeof ConfigurationSchema.State {
  /**
   * Ensure the defaults are populated.
   */
  const configurable = config.configurable ?? {}
  return {
    thread_id: configurable.thread_id ?? "",
    pageTitle: configurable.pageTitle,
    pageUrl: configurable.pageUrl,
    // The routes always set it, from the request or else the business's default language
    language: matchLanguage(configurable.language) ?? DEFAULT_LANGUAGE,
  }
}
