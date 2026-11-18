import { AIMessage } from "@langchain/core/messages"
import { BaseCheckpointSaver, END, START, StateGraph } from "@langchain/langgraph"

import { ConfigurationSchema } from "./configuration"
import { createCallModel } from "./nodes/callModel"
import { createDetermineState } from "./nodes/determineState"
import { createHandoffNode } from "./nodes/handoffNode"
import { StateAwareToolNode } from "./nodes/stateAwareToolNode"
import { AgentState, ConversationState } from "./state"
import type { PreSalesSources } from "./types"

// Define the function that determines whether to continue or not
function routeModelOutput(state: typeof AgentState.State): string {
  const messages = state.messages
  const lastMessage = messages[messages.length - 1] as AIMessage

  if (!lastMessage?.tool_calls?.length) {
    return END
  } else {
    return "tools"
  }
}

function routeState(state: typeof AgentState.State): string {
  // Booking a meeting, sending an enquiry or asking to be contacted, as the handoff settings allow
  if (state.conversationState === ConversationState.SCHEDULE_MEETING) {
    return "handoff"
  }

  return "callModel"
}

// Compiled per request: the tools read from the request's data sources and the checkpointer uses its pool
export function createGraph(sources: PreSalesSources, checkpointer?: BaseCheckpointSaver) {
  const workflow = new StateGraph(AgentState, ConfigurationSchema)
    // Define the two nodes we will cycle between
    .addNode("callModel", createCallModel(sources))
    .addNode("tools", new StateAwareToolNode(sources))
    .addNode("determineState", createDetermineState(sources))
    .addNode("handoff", createHandoffNode(sources))

    // Define the edges between the nodes
    .addEdge(START, "determineState")
    .addConditionalEdges("determineState", routeState, ["handoff", "callModel"])
    .addEdge("handoff", END)
    .addConditionalEdges("callModel", routeModelOutput, [END, "tools"])
    .addEdge("tools", "callModel")

  return workflow.compile({ checkpointer })
}

// LangGraph Studio entry (langgraph.json). Studio provides its own checkpointer, the tools use the local development database
export async function graph() {
  process.env.NODE_ENV ||= "development"
  const [{ createDb }, { default: DbDataSource }, { default: EmbeddingSource }] = await Promise.all([
    import("@/utils/db-setup"),
    import("@/apollo/sources/dbDataSource"),
    import("@/apollo/sources/vectorStore"),
  ])
  const db = await createDb("lumi-langgraph-studio")

  return createGraph({ db: new DbDataSource(db), drizzle: db, embeddings: new EmbeddingSource(db.$client) })
}
