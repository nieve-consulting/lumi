import { localizedAs } from "@/services/records"
import type { Language } from "@lumi/shared-contracts/language"

// The language a record's text was returned in, so the model knows which text is still in English, with the fields that
// fell back to English only when there are any (localizedAs): tool results stay in the conversation for every later
// call, so lists don't repeat an empty one for each record
export function modelLocalized(record: { language: Language; fallback_fields: string[] }, fields?: readonly string[]) {
  const { language, fallback_fields } = localizedAs(record, fields)
  return fallback_fields.length ? { language, fallback_fields } : { language }
}
