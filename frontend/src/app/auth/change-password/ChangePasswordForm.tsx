"use client"

import { useState } from "react"
import { unstable_rethrow } from "next/navigation"
import { zodResolver } from "@hookform/resolvers/zod"
import { adminPasswordSchema, MIN_ADMIN_PASSWORD_LENGTH } from "@lumi/shared-contracts/adminAccounts"
import { signIn } from "next-auth/react"
import { useForm } from "react-hook-form"
import { z } from "zod"

import { ADMIN_HOME, signInPath } from "@/lib/auth/paths"
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form"
import { Input } from "@/components/ui/input"
import { LoadingButton, LoadingButtonState } from "@/components/ui/loading-button"

import { changePassword } from "./actions"

const schema = z
  .object({
    currentPassword: z.string().min(1, "Enter your current password"),
    newPassword: adminPasswordSchema,
    confirmPassword: z.string(),
  })
  .refine(({ newPassword, confirmPassword }) => newPassword === confirmPassword, {
    path: ["confirmPassword"],
    message: "The passwords don't match",
  })

type ChangePasswordValues = z.infer<typeof schema>

interface ChangePasswordFormProps {
  // The account's email, for password managers to save the new password with
  email: string
  // Signed in with a temporary password, which is the current one
  temporary: boolean
}

export default function ChangePasswordForm({ email, temporary }: ChangePasswordFormProps) {
  const [error, setError] = useState<string>()
  const form = useForm<ChangePasswordValues>({
    resolver: zodResolver(schema),
    defaultValues: { currentPassword: "", newPassword: "", confirmPassword: "" },
  })
  const pending = form.formState.isSubmitting

  async function onSubmit({ currentPassword, newPassword }: ChangePasswordValues) {
    setError(undefined)
    try {
      const result = await changePassword(currentPassword, newPassword)
      if (result.ok) {
        // The change ended every session of the account, this one included: sign in again with the new password, then open
        // the admin with a full navigation so every server component reads the new session. Should that fail, the sign-in page
        const signedIn = await signIn("local", { redirect: false, email, password: newPassword, callbackUrl: ADMIN_HOME }).catch(() => undefined)
        window.location.assign(signedIn?.ok && !signedIn.error ? ADMIN_HOME : signInPath(ADMIN_HOME))
        // Stays pending while the page loads
        await new Promise(() => {})
      } else if ("field" in result) {
        const message = temporary && result.field === "currentPassword" ? "Your temporary password is incorrect." : result.message
        form.setError(result.field, { message }, { shouldFocus: true })
        if (result.field === "currentPassword") form.resetField("currentPassword", { keepError: true })
      } else {
        setError(result.error)
      }
    } catch (failure) {
      // A removed account redirects, which rejects the action's promise with Next.js's redirect error
      unstable_rethrow(failure)
      console.error("Changing the password failed", failure)
      setError("Your password couldn't be changed: the server didn't answer. Try again in a moment.")
    }
  }

  return (
    <Form {...form}>
      <form noValidate onSubmit={form.handleSubmit(onSubmit)} className="space-y-4 text-left">
        <div role="alert">{error && <p className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error}</p>}</div>
        {/* For password managers: the account the new password belongs to */}
        <input type="text" name="username" autoComplete="username" value={email} readOnly hidden />
        <FormField
          control={form.control}
          name="currentPassword"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{temporary ? "Temporary password" : "Current password"}</FormLabel>
              <FormControl>
                <Input {...field} type="password" autoComplete="current-password" aria-required />
              </FormControl>
              {temporary && <FormDescription>The one you just signed in with.</FormDescription>}
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="newPassword"
          render={({ field }) => (
            <FormItem>
              <FormLabel>New password</FormLabel>
              <FormControl>
                <Input {...field} type="password" autoComplete="new-password" aria-required />
              </FormControl>
              <FormDescription>At least {MIN_ADMIN_PASSWORD_LENGTH} characters.</FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="confirmPassword"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Confirm new password</FormLabel>
              <FormControl>
                <Input {...field} type="password" autoComplete="new-password" aria-required />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <LoadingButton
          type="submit"
          className="w-full"
          state={pending ? LoadingButtonState.Loading : LoadingButtonState.Idle}
          text="Change password"
          loadingText="Changing..."
        />
      </form>
    </Form>
  )
}
