"use client"

import { useState } from "react"
import { signIn } from "next-auth/react"

import { LoadingButton, LoadingButtonState } from "@/components/ui/loading-button"

interface SignInButtonProps {
  callbackUrl: string
  text?: string
}

export default function SignInButton({ callbackUrl, text = "Sign in with Google" }: SignInButtonProps) {
  const [state, setState] = useState(LoadingButtonState.Idle)

  function onClick() {
    setState(LoadingButtonState.Loading)
    signIn("google", { callbackUrl }).catch(() => setState(LoadingButtonState.Idle))
  }

  return <LoadingButton className="w-full" state={state} text={text} loadingText="Redirecting to Google..." onClick={onClick} />
}
