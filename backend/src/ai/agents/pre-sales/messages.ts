import { AIMessage, AIMessageChunk, BaseMessage, HumanMessage } from "@langchain/core/messages"
import type { LumiMessage, MessageAnnotation } from "@lumi/shared-contracts/chat"

// Maps LangGraph state messages to chat UI messages; cards and references travel as metadata
export function toLumiMessages(messages: BaseMessage[]): LumiMessage[] {
  return messages.flatMap((m, idx): LumiMessage[] => {
    const id = m.id ?? `message-${idx}`

    if (HumanMessage.isInstance(m)) {
      return [{ id, role: "user", parts: [{ type: "text", text: m.text }] }]
    }

    if ((AIMessageChunk.isInstance(m) || AIMessage.isInstance(m)) && m.text) {
      return [{ id, role: "assistant", parts: [{ type: "text", text: m.text }], metadata: m.additional_kwargs as MessageAnnotation }]
    }

    return []
  })
}

// Escapes text placed inside a tag of a prompt, so it can't close the tag or open another
export const escapeMarkup = (text: string) => text.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;")

// Keeps the start and the end of a long message, where visitors tend to introduce their need and ask their question
function shorten(text: string, maxLength: number) {
  if (text.length <= maxLength) return text

  const half = Math.floor(maxLength / 2)
  return `${text.slice(0, half)} […] ${text.slice(-half)}`
}

// Plain-text transcript for the helper prompts, optionally limited to the last `limit` messages. Tool calls and tool
// results are left out: they can be large (search results, team member lists) and the helpers only need what was said.
// Each message is wrapped in a <user> or <assistant> tag with its markup escaped, so multi-line text that looks like more
// turns (a pasted chat or email thread, or a forged "Assistant:" line) stays inside the message it was sent in. Helpers that
// only need the gist pass `maxMessageLength` to shorten long messages
export function formatTranscript(messages: BaseMessage[], limit?: number, maxMessageLength?: number) {
  const lines = messages
    .filter((m) => ["human", "ai"].includes(m.getType()) && m.text)
    .map((m) => {
      const role = m.getType() === "human" ? "user" : "assistant"
      const text = maxMessageLength ? shorten(m.text, maxMessageLength) : m.text
      return `<${role}>\n${escapeMarkup(text)}\n</${role}>`
    })

  return (limit ? lines.slice(-limit) : lines).join("\n\n")
}
