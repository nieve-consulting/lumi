import { createHash } from "node:crypto"

import { conflict } from "./errors"

// JSON with sorted keys and dates as ISO strings, so equal values always serialize the same way
export function stableStringify(value: unknown): string {
  return JSON.stringify(value, (_key, item) => {
    if (item instanceof Date) return item.toISOString()
    if (item && typeof item === "object" && !Array.isArray(item)) {
      return Object.fromEntries(Object.entries(item).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)))
    }
    return item
  })
}

// Opaque version of a record: a hash of its editable content (and, for records with relationships, of those links). Any
// edit, from the admin interface or the MCP server, changes it, which lets updates detect intervening edits
export function versionOf(content: unknown) {
  return createHash("sha256").update(stableStringify(content)).digest("base64url").slice(0, 22)
}

export function assertVersion(expected: string, current: string, entity: string) {
  if (expected !== current) {
    throw conflict(`The ${entity} changed since you last read it. Fetch it again, review the current values and retry with the new version.`, {
      current_version: current,
    })
  }
}
