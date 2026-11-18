import { appUrl } from "@/utils/urls"
import type { Language } from "@lumi/shared-contracts/language"
import { teamMemberResumePath } from "@lumi/shared-contracts/resume"

// Display URLs of approved assets: images attached to a record served through the web app's media route, sized for display.
// Raw storage keys are never returned by the services
export function mediaUrl(key: string | null | undefined, size: { w: number; h?: number }) {
  if (!key) return null

  const params = new URLSearchParams({ w: String(size.w), ...(size.h ? { h: String(size.h) } : {}) })
  return appUrl(`/media/${key}?${params}`)
}

// The PDF resume in the language
export function teamMemberPdfUrl(id: string, language?: Language) {
  return appUrl(teamMemberResumePath(id, language))
}
