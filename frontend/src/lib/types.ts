import type { UIMessage } from "ai"

export enum LoadingState {
  Idle,
  Loading,
  Error,
}

export type { Card, LumiDataTypes, LumiMessage, MessageAnnotation, Reference } from "@lumi/shared-contracts/chat"

export function getMessageText(message: Pick<UIMessage, "parts">): string {
  return message.parts.map((part) => (part.type === "text" ? part.text : "")).join("")
}
