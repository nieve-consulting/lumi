import type { JSONValue, UIMessage } from "ai"

export type Card = {
  card_type: string
  id: string
  payload: JSONValue
}

export type Reference = {
  title: string
  url: string
}

export type MessageAnnotation = {
  cards?: Card[]
  references?: Reference[]
}

// Custom data parts streamed by the agents API
export type LumiDataTypes = {
  status: { message: string }
}

// Cards and references are carried as message metadata
export type LumiMessage = UIMessage<MessageAnnotation, LumiDataTypes>
