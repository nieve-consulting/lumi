"use client"

import { useState } from "react"
import { signOut } from "next-auth/react"

import { SIGN_IN_PATH } from "@/lib/auth/paths"
import { LoadingButton, LoadingButtonState } from "@/components/ui/loading-button"

interface SignOutButtonProps {
  className?: string
  variant?: "default" | "outline" | "secondary" | "ghost"
}

export default function SignOutButton({ className, variant = "outline" }: SignOutButtonProps) {
  const [state, setState] = useState(LoadingButtonState.Idle)

  function onClick() {
    setState(LoadingButtonState.Loading)
    signOut({ callbackUrl: SIGN_IN_PATH }).catch(() => setState(LoadingButtonState.Idle))
  }

  return <LoadingButton className={className} variant={variant} state={state} text="Sign out" loadingText="Signing out..." onClick={onClick} />
}
