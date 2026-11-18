"use client"

import { useEffect, useId, useRef, useState } from "react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

import { unlockSetup } from "./actions"

interface IProps {
  // Nothing is accepted. invalid: the server's token is too short or the deploy/.env.example placeholder. missing: local
  // sign-in mode, which needs a token, has none
  unavailable?: "invalid" | "missing"
  // Why the gate shows again, e.g. after the access expired while the wizard was open
  notice?: string
  onUnlocked: () => void
}

// Asks for the installation's setup token before the wizard
export default function SetupGate({ unavailable, notice, onUnlocked }: IProps) {
  const [token, setToken] = useState("")
  const [error, setError] = useState<string>()
  const [checking, setChecking] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const headingRef = useRef<HTMLHeadingElement>(null)
  const id = useId()

  // Shown again over the wizard, the gate takes focus so its notice is read
  useEffect(() => {
    if (notice) headingRef.current?.focus()
  }, [notice])

  async function submit() {
    setChecking(true)
    setError(undefined)
    try {
      const result = await unlockSetup(token)
      if (result.ok) {
        setToken("")
        onUnlocked()
      } else {
        setError(result.error)
        requestAnimationFrame(() => inputRef.current?.focus())
      }
    } catch (failure) {
      console.error("Checking the setup token failed", failure)
      setError("The setup token couldn't be checked: the server didn't answer. Try again in a moment.")
    } finally {
      setChecking(false)
    }
  }

  return (
    <div className="mx-auto max-w-3xl">
      <form
        noValidate
        className="space-y-5 rounded-md border border-slate-200 bg-white p-6 shadow-sm"
        onSubmit={(event) => {
          event.preventDefault()
          if (!unavailable) submit()
        }}
      >
        <div>
          <h2 ref={headingRef} tabIndex={-1} className="text-xl font-semibold outline-none">
            {unavailable === "missing" ? "Setup unavailable" : "Enter the setup token"}
          </h2>
          {unavailable !== "missing" && (
            <p className="text-sm text-slate-600">This installation asks for the setup token its operator configured before it can be set up.</p>
          )}
        </div>
        {notice && (
          <p role="alert" className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
            {notice}
          </p>
        )}
        {unavailable === "missing" ? (
          <p role="alert" className="text-sm font-medium text-red-700">
            Whoever completes the setup becomes the first admin, so it needs a setup token. Set LUMI_SETUP_TOKEN (at least 16 characters) on the web
            app and redeploy it, then reload this page. If you didn&apos;t install Lumi, ask the person who did.
          </p>
        ) : unavailable === "invalid" ? (
          <p role="alert" className="text-sm font-medium text-red-700">
            Setup is unavailable: LUMI_SETUP_TOKEN on the web app is too short or still the placeholder from deploy/.env.example. Set a random value
            of at least 16 characters and redeploy it, then reload this page. If you didn&apos;t install Lumi, ask the person who did.
          </p>
        ) : (
          <>
            <div className="space-y-2">
              <Label htmlFor={`${id}-token`}>Setup token</Label>
              <Input
                ref={inputRef}
                id={`${id}-token`}
                type="password"
                autoComplete="off"
                spellCheck={false}
                value={token}
                onChange={(event) => setToken(event.target.value)}
                aria-invalid={error ? true : undefined}
                aria-describedby={error ? `${id}-error` : undefined}
                className="max-w-md"
              />
              {error && (
                <p id={`${id}-error`} className="text-sm font-medium text-red-700">
                  {error}
                </p>
              )}
            </div>
            <Button type="submit" disabled={checking}>
              {checking ? "Checking…" : "Continue"}
            </Button>
          </>
        )}
      </form>
    </div>
  )
}
