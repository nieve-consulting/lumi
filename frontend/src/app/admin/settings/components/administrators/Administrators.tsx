"use client"

import { useState } from "react"
import type { AdminAccount } from "@/generated/graphql"
import { zodResolver } from "@hookform/resolvers/zod"
import { adminEmailSchema, adminNameSchema } from "@lumi/shared-contracts/adminAccounts"
import { Check, Copy, Plus, Trash2 } from "lucide-react"
import { useForm } from "react-hook-form"
import { z } from "zod"

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form"
import { Input } from "@/components/ui/input"
import { LoadingButton, LoadingButtonState } from "@/components/ui/loading-button"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { useToast } from "@/components/ui/use-toast"

import { createAdministrator, removeAdministrator } from "./actions"

export type AdministratorRow = Pick<AdminAccount, "id" | "email" | "name" | "mustChangePassword" | "lastSignInAt">

interface AdministratorsProps {
  accounts: AdministratorRow[]
  // The signed-in admin, who can't remove themselves
  currentId: string
}

const dateTimeFormat = new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" })

// In the admin's own time zone and language, so it can differ from the server's render
function LastSignIn({ value }: { value?: string | null }) {
  if (!value) return <span className="text-slate-500">Never</span>
  return (
    <time dateTime={value} suppressHydrationWarning>
      {dateTimeFormat.format(new Date(value))}
    </time>
  )
}

// The admins of local sign-in mode: who they are, when they last signed in and whether they still have a temporary password
export default function Administrators({ accounts, currentId }: AdministratorsProps) {
  const [removing, setRemoving] = useState<AdministratorRow>()

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <AddAdministrator />
      </div>
      {accounts.length === 0 ? (
        <p className="text-sm text-slate-600">No admins yet.</p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Email</TableHead>
              <TableHead>Name</TableHead>
              <TableHead>Last sign-in</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>
                <span className="sr-only">Actions</span>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {accounts.map((account) => (
              <TableRow key={account.id}>
                <TableCell className="font-medium break-all">
                  {account.email}
                  {account.id === currentId && <span className="ml-2 font-normal text-slate-500">(you)</span>}
                </TableCell>
                <TableCell>{account.name || <span className="text-slate-500">Not set</span>}</TableCell>
                <TableCell className="whitespace-nowrap">
                  <LastSignIn value={account.lastSignInAt} />
                </TableCell>
                <TableCell>
                  {account.mustChangePassword ? (
                    <Badge variant="outline" className="border-amber-300 bg-amber-50 whitespace-nowrap text-amber-900">
                      Temporary password
                    </Badge>
                  ) : (
                    <span className="text-slate-600">Active</span>
                  )}
                </TableCell>
                <TableCell className="text-right">
                  {account.id !== currentId && (
                    <Button variant="ghost" size="sm" onClick={() => setRemoving(account)}>
                      <Trash2 aria-hidden /> Remove<span className="sr-only"> {account.email}</span>
                    </Button>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
      <p className="text-sm text-slate-600">
        A temporary password stays until its admin signs in and chooses their own. To reset someone&apos;s password, remove them and add them again.
      </p>
      <RemoveAdministrator account={removing} onClose={() => setRemoving(undefined)} />
    </div>
  )
}

const addSchema = z.object({
  email: adminEmailSchema,
  // The shared rule, with the field kept a string for the form; the action normalizes it
  name: z.string().superRefine((name, context) => {
    const result = adminNameSchema.safeParse(name)
    if (!result.success) context.addIssue({ code: "custom", message: result.error.issues[0]?.message ?? "Invalid name" })
  }),
})

type AddValues = z.input<typeof addSchema>

function AddAdministrator() {
  const [open, setOpen] = useState(false)
  const [error, setError] = useState<string>()
  // The new admin and their temporary password, shown once
  const [created, setCreated] = useState<{ email: string; temporaryPassword: string }>()
  const form = useForm<AddValues, unknown, z.output<typeof addSchema>>({ resolver: zodResolver(addSchema), defaultValues: { email: "", name: "" } })

  function onOpenChange(next: boolean) {
    setOpen(next)
    if (!next) {
      // Nothing of the temporary password stays once closed
      setCreated(undefined)
      setError(undefined)
      form.reset()
    }
  }

  async function onSubmit({ email, name }: z.output<typeof addSchema>) {
    setError(undefined)
    try {
      const result = await createAdministrator({ email, name })
      if (result.ok) {
        // The action already refreshed the list
        setCreated({ email: result.email, temporaryPassword: result.temporaryPassword })
      } else if ("field" in result) {
        form.setError(result.field, { message: result.message }, { shouldFocus: true })
      } else {
        setError(result.error)
      }
    } catch (failure) {
      console.error("Adding an admin failed", failure)
      setError("The admin couldn't be added: the server didn't answer. Try again in a moment.")
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <Button onClick={() => setOpen(true)}>
        <Plus aria-hidden /> Add admin
      </Button>
      <DialogContent
        // Neither a click outside nor Escape loses a temporary password that isn't shown again: Done closes it
        onInteractOutside={(event) => created && event.preventDefault()}
        onEscapeKeyDown={(event) => created && event.preventDefault()}
        hideClose={Boolean(created)}
      >
        {created ? (
          <TemporaryPassword {...created} onDone={() => onOpenChange(false)} />
        ) : (
          <>
            <DialogHeader>
              <DialogTitle>Add an admin</DialogTitle>
              <DialogDescription>
                They get a temporary password, which you share with them. They choose their own when they first sign in.
              </DialogDescription>
            </DialogHeader>
            <Form {...form}>
              <form noValidate onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                <div role="alert">{error && <p className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error}</p>}</div>
                <FormField
                  control={form.control}
                  name="email"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Email</FormLabel>
                      <FormControl>
                        <Input {...field} type="email" autoComplete="off" autoCapitalize="none" spellCheck={false} aria-required />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="name"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>
                        Name <span className="font-normal text-slate-600">(optional)</span>
                      </FormLabel>
                      <FormControl>
                        <Input {...field} autoComplete="off" />
                      </FormControl>
                      <FormDescription>Shown in this list.</FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <DialogFooter>
                  <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                    Cancel
                  </Button>
                  <LoadingButton
                    type="submit"
                    state={form.formState.isSubmitting ? LoadingButtonState.Loading : LoadingButtonState.Idle}
                    text="Add admin"
                    loadingText="Adding..."
                  />
                </DialogFooter>
              </form>
            </Form>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}

function TemporaryPassword({ email, temporaryPassword, onDone }: { email: string; temporaryPassword: string; onDone: () => void }) {
  const [copied, setCopied] = useState<boolean>()

  async function copy() {
    try {
      await navigator.clipboard.writeText(temporaryPassword)
      setCopied(true)
    } catch {
      setCopied(false)
    }
  }

  return (
    <>
      <DialogHeader>
        <DialogTitle>Admin added</DialogTitle>
        <DialogDescription>
          Share this temporary password with {email} privately. It won&apos;t be shown again. They&apos;ll choose their own password when they first
          sign in.
        </DialogDescription>
      </DialogHeader>
      <div className="space-y-2">
        <label htmlFor="temporary-password" className="text-sm font-medium">
          Temporary password
        </label>
        <div className="flex gap-2">
          <Input
            id="temporary-password"
            // The submit button that had focus is gone; this reads the password out with its label
            autoFocus
            readOnly
            value={temporaryPassword}
            spellCheck={false}
            className="font-mono"
            onFocus={(event) => event.currentTarget.select()}
          />
          <Button type="button" variant="outline" onClick={copy}>
            {copied ? <Check aria-hidden /> : <Copy aria-hidden />} {copied ? "Copied" : "Copy"}
          </Button>
        </div>
        <p role="status" className="text-sm text-slate-600">
          {copied === true ? "Copied to the clipboard." : copied === false ? "Couldn't copy it: select the password and copy it yourself." : ""}
        </p>
      </div>
      <DialogFooter>
        <Button type="button" onClick={onDone}>
          Done
        </Button>
      </DialogFooter>
    </>
  )
}

function RemoveAdministrator({ account, onClose }: { account?: AdministratorRow; onClose: () => void }) {
  const { toast } = useToast()
  const [pending, setPending] = useState(false)

  async function remove(event: React.MouseEvent) {
    // Stays open until removed, to show it's working
    event.preventDefault()
    if (!account) return
    setPending(true)
    try {
      const result = await removeAdministrator(account.id)
      if (result.ok) {
        toast({ title: "Admin removed", description: `${account.email} can no longer sign in.` })
        // The action already refreshed the list
        onClose()
      } else {
        toast({ variant: "destructive", title: "Couldn't remove the admin", description: result.error })
      }
    } catch (failure) {
      console.error("Removing an admin failed", failure)
      toast({ variant: "destructive", title: "Couldn't remove the admin", description: "The server didn't answer. Try again in a moment." })
    } finally {
      setPending(false)
    }
  }

  return (
    <AlertDialog open={Boolean(account)} onOpenChange={(open) => !open && !pending && onClose()}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Remove {account?.email}?</AlertDialogTitle>
          <AlertDialogDescription>
            They can no longer sign in, and lose access to the admin at once if they&apos;re signed in now. You can add them again later.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={pending}>Cancel</AlertDialogCancel>
          <AlertDialogAction onClick={remove} disabled={pending}>
            {pending ? "Removing..." : "Remove admin"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
