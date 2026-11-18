import { type VariantProps } from "class-variance-authority"
import { Loader2 } from "lucide-react"

import { Button, buttonVariants } from "./button"

export enum LoadingButtonState {
  Idle = "idle",
  Loading = "loading",
}

interface IProps extends React.ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof buttonVariants> {
  state: LoadingButtonState
  text?: string
  loadingText?: string
  children?: React.ReactNode
}

export function LoadingButton({ state, text, loadingText, children, disabled, ...props }: IProps) {
  return (
    <Button {...props} disabled={disabled || state === LoadingButtonState.Loading}>
      {state === LoadingButtonState.Loading && (
        <>
          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          {loadingText}
        </>
      )}
      {state === LoadingButtonState.Idle && (text || children)}
    </Button>
  )
}
