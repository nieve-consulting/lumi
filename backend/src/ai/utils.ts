import { dispatchCustomEvent } from "@langchain/core/callbacks/dispatch"

export { appUrl } from "@/utils/urls"

export function emitStatusUpdate(status: string) {
  return dispatchCustomEvent("statusUpdate", status)
}
