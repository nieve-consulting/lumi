"use client"

import { useEffect, useRef, useState } from "react"

import type { SetupGate as Gate } from "@/lib/setupToken"

import { expireStaleBusiness } from "./actions"
import BusinessWizard from "./BusinessWizard"
import SetupGate from "./SetupGate"

const EXPIRED =
  "Your access to the setup expired or the setup token changed, so the settings weren't saved. Enter the setup token again to finish: your entries are kept."

// The setup token gate, when the installation sets one, then the wizard. The wizard stays mounted behind the gate, so what
// was entered survives the access expiring before finishing
// expireStaleCache: the server still caches settings the API no longer has. askAdmin: local sign-in mode has no admin yet, so
// the wizard creates the first. local: local sign-in mode, where finishing leads to the admin's sign-in
interface SetupFlowProps {
  gate: Gate
  expireStaleCache: boolean
  askAdmin: boolean
  local: boolean
}

export default function SetupFlow({ gate, expireStaleCache, askAdmin, local }: SetupFlowProps) {
  const [locked, setLocked] = useState(gate === "locked" || gate === "misconfigured" || gate === "missing")
  const [notice, setNotice] = useState<string>()
  const wizardRef = useRef<HTMLDivElement>(null)
  const unlockedNow = useRef(false)

  useEffect(() => {
    if (expireStaleCache) expireStaleBusiness().catch((error) => console.error("Couldn't expire the cached business settings", error))
  }, [expireStaleCache])

  // The gate had focus: it moves to the wizard's step once the wizard shows
  useEffect(() => {
    if (locked || !unlockedNow.current) return
    unlockedNow.current = false
    wizardRef.current?.querySelector<HTMLElement>("h2")?.focus()
  }, [locked])

  return (
    <>
      {locked && (
        <SetupGate
          unavailable={gate === "misconfigured" ? "invalid" : gate === "missing" ? "missing" : undefined}
          notice={notice}
          onUnlocked={() => {
            setLocked(false)
            setNotice(undefined)
            unlockedNow.current = true
          }}
        />
      )}
      <div ref={wizardRef} hidden={locked}>
        <BusinessWizard
          askAdmin={askAdmin}
          local={local}
          onLocked={() => {
            setNotice(EXPIRED)
            setLocked(true)
          }}
        />
      </div>
    </>
  )
}
