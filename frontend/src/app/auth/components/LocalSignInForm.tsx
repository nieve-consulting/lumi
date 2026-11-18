"use client"

import { useState } from "react"
import { zodResolver } from "@hookform/resolvers/zod"
import { signIn } from "next-auth/react"
import { useForm } from "react-hook-form"
import { z } from "zod"

import { localSignInErrorMessage } from "@/lib/auth/messages"
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form"
import { Input } from "@/components/ui/input"
import { LoadingButton, LoadingButtonState } from "@/components/ui/loading-button"

// Only that both are there: the API checks them, and a temporary or older password may not follow today's rules
const schema = z.object({
  email: z.string().trim().min(1, "Enter your email address"),
  password: z.string().min(1, "Enter your password"),
})

type SignInForm = z.infer<typeof schema>

interface LocalSignInFormProps {
  // Where to go once signed in, already checked by the page
  callbackUrl: string
  // An error NextAuth sent back to the sign-in page
  initialError?: string
}

// Email and password sign-in (local mode). Errors are announced and leave the email as entered
export default function LocalSignInForm({ callbackUrl, initialError }: LocalSignInFormProps) {
  const [error, setError] = useState(() => localSignInErrorMessage(initialError))
  const form = useForm<SignInForm>({ resolver: zodResolver(schema), defaultValues: { email: "", password: "" } })
  const pending = form.formState.isSubmitting

  async function onSubmit({ email, password }: SignInForm) {
    setError(undefined)
    try {
      const result = await signIn("local", { redirect: false, email, password, callbackUrl })
      if (result?.ok && !result.error) {
        // A full navigation, so every server component reads the new session
        window.location.assign(callbackUrl)
        // Stays pending while the admin loads
        await new Promise(() => {})
        return
      }
      setError(localSignInErrorMessage(result?.error ?? "Default"))
    } catch (failure) {
      console.error("Signing in failed", failure)
      setError(localSignInErrorMessage("CredentialsCheckFailed"))
    }
    form.resetField("password")
    form.setFocus("password")
  }

  return (
    <Form {...form}>
      <form noValidate onSubmit={form.handleSubmit(onSubmit)} className="space-y-4 text-left">
        <div role="alert">{error && <p className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error}</p>}</div>
        <FormField
          control={form.control}
          name="email"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Email</FormLabel>
              <FormControl>
                <Input {...field} type="email" autoComplete="username" autoCapitalize="none" spellCheck={false} aria-required />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="password"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Password</FormLabel>
              <FormControl>
                <Input {...field} type="password" autoComplete="current-password" aria-required />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <LoadingButton
          type="submit"
          className="w-full"
          state={pending ? LoadingButtonState.Loading : LoadingButtonState.Idle}
          text="Sign in"
          loadingText="Signing in..."
        />
      </form>
    </Form>
  )
}
