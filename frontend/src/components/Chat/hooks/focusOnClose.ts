import { useEffect, useRef, type RefObject } from "react"

// A closed conversation disables the message box, so focus moves off it with focusClosed, e.g. to the closed notice's "Start
// new conversation" button. Only while the chat's window has focus, and only when focus was in the composer or fell to the
// page: focus already somewhere useful stays, e.g. on the booking confirmation.
// afterLoad: also once a stored closed conversation finished loading, as in the widget, which takes focus when it opens.
// Otherwise only when the open conversation closes, so a page showing a stored closed conversation leaves focus alone
export function useFocusOnClose({
  closed,
  loadingThread,
  composerRef,
  focusClosed,
  afterLoad = false,
}: {
  closed: boolean
  loadingThread: boolean
  composerRef: RefObject<HTMLElement | null>
  focusClosed: () => void
  afterLoad?: boolean
}) {
  const wasClosed = useRef(false)

  useEffect(() => {
    const closedNow = closed && !wasClosed.current
    wasClosed.current = closed
    if (!closed || !document.hasFocus()) return
    if (!afterLoad && (!closedNow || loadingThread)) return
    const focusLost = document.activeElement === document.body || !!composerRef.current?.contains(document.activeElement)
    if (focusLost) focusClosed()
  }, [closed, loadingThread, afterLoad, composerRef, focusClosed])
}
