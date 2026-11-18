import { BaseMessage } from "@langchain/core/messages"
import { Annotation, messagesStateReducer } from "@langchain/langgraph"

export enum ConversationState {
  CUSTOMER_NEEDS_GATHERING = "CUSTOMER_NEEDS_GATHERING",
  COMPANY_OVERVIEW = "COMPANY_OVERVIEW",
  SCHEDULE_MEETING = "SCHEDULE_MEETING",
  HIRING_CANDIDATE = "HIRING_CANDIDATE",
}

export const AgentState = Annotation.Root({
  messages: Annotation<BaseMessage[]>({
    reducer: messagesStateReducer,
  }),
  conversationState: Annotation<ConversationState>({
    reducer: (x, y) => y ?? x,
    default: () => ConversationState.CUSTOMER_NEEDS_GATHERING,
  }),
  // The language of the visitor's latest message as an ISO 639-1 code, set with the conversation state, so Lumi's fixed
  // replies (see replyText) are in the language of its generated ones
  replyLanguage: Annotation<string | undefined>({
    reducer: (x, y) => y ?? x,
    default: () => undefined,
  }),
})

export type AgentStateType = typeof AgentState.State
export type AgentStateUpdateType = typeof AgentState.Update
