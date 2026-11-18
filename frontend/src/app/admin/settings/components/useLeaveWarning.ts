"use client"

import { useEffect } from "react"

// Asks before leaving the page while a settings form has unsaved changes: closing or reloading the tab, and following a
// link to another admin page. message: what the confirmation asks
export function useLeaveWarning(dirty: boolean, message: string) {
  useEffect(() => {
    if (!dirty) return
    function warn(event: BeforeUnloadEvent) {
      event.preventDefault()
    }
    function guardNavigation(event: MouseEvent) {
      // New tabs and downloads leave this draft open, so they need no warning.
      if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return
      const target = event.target
      const link = target instanceof Element ? target.closest<HTMLAnchorElement>("a[href]") : null
      if (!link || link.hasAttribute("download") || (link.target && link.target !== "_self")) return
      const destination = new URL(link.href, window.location.href)
      if (destination.origin !== window.location.origin) return
      if (destination.pathname === window.location.pathname && destination.search === window.location.search) return
      if (!window.confirm(message)) {
        event.preventDefault()
        event.stopPropagation()
      }
    }
    window.addEventListener("beforeunload", warn)
    document.addEventListener("click", guardNavigation, true)
    return () => {
      window.removeEventListener("beforeunload", warn)
      document.removeEventListener("click", guardNavigation, true)
    }
  }, [dirty, message])
}
