"use client"

import { useEffect, useRef, useState } from "react"
import { usePathname } from "next/navigation"
import * as DialogPrimitive from "@radix-ui/react-dialog"
import { Menu, X } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Dialog, DialogClose, DialogOverlay, DialogPortal, DialogTitle, DialogTrigger } from "@/components/ui/dialog"

import AdminNav from "./AdminNav"
import Brand from "./Brand"

// Whether an element is display: none, as the trigger is from lg up. Safari only has checkVisibility() from 17.4
const isHidden = (element: HTMLElement | null) => !element?.getClientRects().length

interface MobileMenuProps {
  // Shown below the links, as in SideMenu: the installation's Lumi version
  footer?: React.ReactNode
}

// Navigation drawer for viewports below lg
export default function MobileMenu({ footer }: MobileMenuProps) {
  const pathname = usePathname()
  const [open, setOpen] = useState(false)
  const [prevPathname, setPrevPathname] = useState(pathname)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const close = () => setOpen(false)

  // The layout stays mounted across navigations, so also close the drawer when the route changes without its links, e.g.
  // with the back button or a redirect. Its links close it right away rather than once the next page has loaded
  if (pathname !== prevPathname) {
    setPrevPathname(pathname)
    setOpen(false)
  }

  // Back and forward close it right away too, including between URLs that differ only in their search parameters, such
  // as the dashboard's ranges
  useEffect(() => {
    if (!open) return

    const closeOnHistory = () => setOpen(false)
    window.addEventListener("popstate", closeOnHistory)
    return () => window.removeEventListener("popstate", closeOnHistory)
  }, [open])

  // The trigger and drawer are hidden from lg up, where SideMenu takes over, so close the drawer once the viewport widens
  // enough to hide the trigger rather than leave its hidden focus trap and scroll lock in place. Checking the trigger
  // rather than a media query keeps the breakpoint in the classes alone
  useEffect(() => {
    if (!open) return

    const closeOnDesktop = () => {
      if (isHidden(triggerRef.current)) setOpen(false)
    }
    window.addEventListener("resize", closeOnDesktop)
    return () => window.removeEventListener("resize", closeOnDesktop)
  }, [open])

  // Closing returns focus to the trigger, which the viewport widening to desktop hides. Focus then moves to the sidebar's
  // link to the current section, or to the main content, rather than dropping to the page
  const focusOnClose = (event: Event) => {
    if (!isHidden(triggerRef.current)) return

    event.preventDefault()
    const target = document.querySelector<HTMLElement>("#admin-sidebar [aria-current]") ?? document.getElementById("main")
    target?.focus()
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild ref={triggerRef}>
        <Button
          variant="ghost"
          size="icon"
          aria-label="Open navigation"
          className="shrink-0 text-slate-700 hover:bg-slate-300 lg:hidden [&_svg]:size-5"
        >
          <Menu aria-hidden />
        </Button>
      </DialogTrigger>
      <DialogPortal>
        <DialogOverlay className="lg:hidden" />
        <DialogPrimitive.Content
          aria-describedby={undefined}
          onCloseAutoFocus={focusOnClose}
          className="motion-safe:data-[state=closed]:animate-out motion-safe:data-[state=open]:animate-in motion-safe:data-[state=closed]:slide-out-to-left-[100%] motion-safe:data-[state=open]:slide-in-from-left-[100%] fixed inset-y-0 left-0 z-50 flex w-72 max-w-[calc(100vw-3rem)] flex-col gap-4 overflow-y-auto border-r border-slate-300 bg-white p-3 shadow-lg duration-200 lg:hidden"
        >
          <DialogTitle className="sr-only">Navigation</DialogTitle>
          <div className="flex items-center justify-between gap-2">
            <Brand onNavigate={close} />
            <DialogClose asChild>
              <Button variant="ghost" size="icon" aria-label="Close navigation" className="shrink-0 text-slate-700 hover:bg-slate-100 [&_svg]:size-5">
                <X aria-hidden />
              </Button>
            </DialogClose>
          </div>
          <AdminNav className="flex-1" onNavigate={close} />
          {footer}
        </DialogPrimitive.Content>
      </DialogPortal>
    </Dialog>
  )
}
