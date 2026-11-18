"use client"

import { useRef, useState } from "react"
import { ApiKeyAccess, type ApiKey } from "@/generated/graphql"
import { zodResolver } from "@hookform/resolvers/zod"
import { Check, Copy, KeyRound, Plus, Trash2, TriangleAlert } from "lucide-react"
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
import { Button, buttonVariants } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form"
import { Input } from "@/components/ui/input"
import { LoadingButton, LoadingButtonState } from "@/components/ui/loading-button"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { useToast } from "@/components/ui/use-toast"

import { createApiKey, revokeApiKey } from "./actions"
import { apiKeyNameSchema } from "./schema"

export type ApiKeyRow = Pick<ApiKey, "id" | "name" | "access" | "lastCharacters" | "createdAt" | "createdBy" | "lastUsedAt">

const ACCESS_OPTIONS = [
  {
    value: ApiKeyAccess.ReadOnly,
    label: "Read-only",
    description: "Reads published records and public business information, and renders PDFs. Can't change anything.",
  },
  {
    value: ApiKeyAccess.Admin,
    label: "Admin",
    description:
      "Can do everything an admin can through the API, but can't manage API keys or administrators. Give it only to systems you trust as much as an administrator.",
  },
] as const

// Shown by both the list and the empty state
const CREATE_BUTTON_ID = "create-api-key"

// Focus goes back to the button that opened a dialog, or to the create button when that one is gone by the time it closes:
// the empty state's, or a revoked key's row. The dialogs have no Radix trigger, which would otherwise leave focus on the page
function useFocusReturn() {
  const opener = useRef<HTMLElement | null>(null)
  return {
    onOpenAutoFocus: () => {
      opener.current = document.activeElement instanceof HTMLElement ? document.activeElement : null
    },
    onCloseAutoFocus: (event: Event) => {
      event.preventDefault()
      const target = opener.current?.isConnected ? opener.current : document.getElementById(CREATE_BUTTON_ID)
      target?.focus()
    },
  }
}

const accessLabel = (access: ApiKeyAccess) => ACCESS_OPTIONS.find(({ value }) => value === access)?.label ?? access

const dateFormat = new Intl.DateTimeFormat(undefined, { dateStyle: "medium" })
const dateTimeFormat = new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" })

// In the admin's own time zone and language, so it can differ from the server's render
function FormattedDate({ value, withTime }: { value: string; withTime?: boolean }) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return <span>{value}</span>
  return (
    <time dateTime={value} suppressHydrationWarning>
      {(withTime ? dateTimeFormat : dateFormat).format(date)}
    </time>
  )
}

// How systems use a key, with a link to the public documentation's API keys page
function KeyUsage() {
  return (
    <>
      For whoever sets up the system: send the key unchanged, without a <code className="font-mono">Bearer</code> prefix, in the{" "}
      <code className="font-mono">Authorization</code> header of requests to <code className="font-mono">/graphql</code> (GraphQL API) or{" "}
      <code className="font-mono">/pdf</code> (PDF rendering). Full details are in Lumi&apos;s{" "}
      <a
        href="https://docs.lumi.nieve.ai/developers/api-keys"
        target="_blank"
        rel="noopener noreferrer"
        className="font-medium text-blue-700 underline"
      >
        API keys documentation
        <span className="sr-only"> (opens in a new tab)</span>
      </a>
      .
    </>
  )
}

// The active API keys: what each may do, how to tell it apart, who created it and when it was last used
export default function ApiKeys({ apiKeys }: { apiKeys: ApiKeyRow[] }) {
  const [creating, setCreating] = useState(false)
  const [revoking, setRevoking] = useState<ApiKeyRow>()
  const createButton = (
    <Button id={CREATE_BUTTON_ID} onClick={() => setCreating(true)}>
      <Plus aria-hidden /> Create API key
    </Button>
  )

  return (
    <div className="space-y-4">
      {apiKeys.length === 0 ? (
        <div className="flex flex-col items-start gap-3 rounded-lg border border-dashed border-slate-300 p-6">
          <KeyRound size={24} aria-hidden className="text-slate-500" />
          <div className="space-y-1">
            <h2 className="font-medium">No API keys yet</h2>
            <p className="max-w-prose text-sm text-slate-600">
              Create a key for each system that uses Lumi&apos;s API, such as your website showing your projects and team. Give each system its own
              key, read-only unless it needs more, so you can cut one off without affecting the others.
            </p>
          </div>
          <p className="max-w-prose text-sm text-slate-600">
            <KeyUsage />
          </p>
          {createButton}
        </div>
      ) : (
        <>
          <div className="flex justify-end">{createButton}</div>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Access</TableHead>
                <TableHead>Created</TableHead>
                <TableHead>Last used</TableHead>
                <TableHead>
                  <span className="sr-only">Actions</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {apiKeys.map((apiKey) => (
                <TableRow key={apiKey.id}>
                  <TableCell>
                    <div className="font-medium break-words">{apiKey.name}</div>
                    <div className="font-mono text-sm whitespace-nowrap text-slate-600">
                      <span aria-hidden>lumi_…</span>
                      <span className="sr-only">Key ending in </span>
                      {apiKey.lastCharacters}
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant="outline"
                      className={
                        apiKey.access === ApiKeyAccess.Admin
                          ? "border-amber-300 bg-amber-50 whitespace-nowrap text-amber-900"
                          : "border-slate-300 bg-slate-50 whitespace-nowrap text-slate-700"
                      }
                    >
                      {accessLabel(apiKey.access)}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <div className="whitespace-nowrap">
                      <FormattedDate value={apiKey.createdAt} />
                    </div>
                    {apiKey.createdBy && <div className="text-sm break-all text-slate-600">by {apiKey.createdBy}</div>}
                  </TableCell>
                  <TableCell className="whitespace-nowrap">
                    {apiKey.lastUsedAt ? <FormattedDate value={apiKey.lastUsedAt} withTime /> : <span className="text-slate-500">Never used</span>}
                  </TableCell>
                  <TableCell className="text-right">
                    <Button variant="ghost" size="sm" onClick={() => setRevoking(apiKey)}>
                      <Trash2 aria-hidden /> Revoke<span className="sr-only"> {apiKey.name}</span>
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          <p className="text-sm text-slate-600">
            Last used can be a few minutes behind. <KeyUsage />
          </p>
        </>
      )}
      {/* Outside the list and the empty state, which replace each other when the first key is created or the last revoked:
      the dialog, and the secret it shows once, must outlive that */}
      <CreateApiKey open={creating} onOpenChange={setCreating} />
      <RevokeApiKey apiKey={revoking} onClose={() => setRevoking(undefined)} />
    </div>
  )
}

const createSchema = z.object({
  name: apiKeyNameSchema,
  access: z.enum(ApiKeyAccess),
})

type CreateValues = z.input<typeof createSchema>

function CreateApiKey({ open, onOpenChange: setOpen }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const focusReturn = useFocusReturn()
  const [error, setError] = useState<string>()
  // The new key and its secret, shown once
  const [created, setCreated] = useState<{ name: string; secret: string }>()
  const form = useForm<CreateValues, unknown, z.output<typeof createSchema>>({
    resolver: zodResolver(createSchema),
    defaultValues: { name: "", access: ApiKeyAccess.ReadOnly },
  })
  // Stays open while the key is being created, so its secret can only show in the dialog that asked for it
  const submitting = form.formState.isSubmitting

  function onOpenChange(next: boolean) {
    if (!next && submitting) return
    setOpen(next)
    if (!next) {
      // Nothing of the secret stays once closed
      setCreated(undefined)
      setError(undefined)
      form.reset()
    }
  }

  async function onSubmit({ name, access }: z.output<typeof createSchema>) {
    setError(undefined)
    try {
      const result = await createApiKey({ name, access })
      if (result.ok) {
        // The action already refreshed the list
        setCreated({ name: result.name, secret: result.secret })
      } else if ("field" in result) {
        form.setError(result.field, { message: result.message }, { shouldFocus: true })
      } else {
        setError(result.error)
      }
    } catch (failure) {
      console.error("Creating an API key failed", failure)
      setError("The key couldn't be created: the server didn't answer. Try again in a moment.")
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        {...focusReturn}
        // Neither a click outside nor Escape interrupts a key being created or loses a secret that isn't shown again: Done closes it
        onInteractOutside={(event) => (created || submitting) && event.preventDefault()}
        onEscapeKeyDown={(event) => (created || submitting) && event.preventDefault()}
        hideClose={Boolean(created) || submitting}
      >
        {created ? (
          <CreatedSecret {...created} onDone={() => onOpenChange(false)} />
        ) : (
          <>
            <DialogHeader>
              <DialogTitle>Create an API key</DialogTitle>
              <DialogDescription>For one system that uses Lumi&apos;s API. You can revoke it at any time.</DialogDescription>
            </DialogHeader>
            <Form {...form}>
              <form noValidate onSubmit={form.handleSubmit(onSubmit)} className="space-y-5">
                <div role="alert">{error && <p className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error}</p>}</div>
                <FormField
                  control={form.control}
                  name="name"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Name</FormLabel>
                      <FormControl>
                        <Input {...field} autoComplete="off" placeholder="e.g. Company website" aria-required />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="access"
                  render={({ field }) => (
                    <fieldset className="space-y-3">
                      <legend className="mb-2 text-sm font-medium">Access</legend>
                      {ACCESS_OPTIONS.map((option) => (
                        <label key={option.value} className="flex items-start gap-2 text-sm">
                          <input
                            type="radio"
                            name={field.name}
                            value={option.value}
                            checked={field.value === option.value}
                            onChange={() => field.onChange(option.value)}
                            onBlur={field.onBlur}
                            className="mt-0.5 size-4 shrink-0 accent-blue-700"
                          />
                          <span>
                            <span className="font-medium">{option.label}</span>
                            <span className="block text-slate-600">{option.description}</span>
                          </span>
                        </label>
                      ))}
                    </fieldset>
                  )}
                />
                <DialogFooter>
                  <Button type="button" variant="outline" disabled={submitting} onClick={() => onOpenChange(false)}>
                    Cancel
                  </Button>
                  <LoadingButton
                    type="submit"
                    state={submitting ? LoadingButtonState.Loading : LoadingButtonState.Idle}
                    text="Create key"
                    loadingText="Creating..."
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

function CreatedSecret({ name, secret, onDone }: { name: string; secret: string; onDone: () => void }) {
  const [copied, setCopied] = useState<boolean>()

  async function copy() {
    try {
      await navigator.clipboard.writeText(secret)
      setCopied(true)
    } catch {
      setCopied(false)
    }
  }

  return (
    <>
      <DialogHeader>
        <DialogTitle>Copy your new key</DialogTitle>
        <DialogDescription>
          {name} is ready. Store the key somewhere safe, such as your system&apos;s secret settings, and send it as it is, with no{" "}
          <code className="font-mono">Bearer</code> prefix, as the <code className="font-mono">Authorization</code> header of each request.
        </DialogDescription>
      </DialogHeader>
      <p id="api-key-shown-once" className="flex gap-2 rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
        <TriangleAlert size={16} aria-hidden className="mt-0.5 shrink-0" />
        <span>
          This is the only time the key is shown. Once you close this, it can&apos;t be seen again: if you lose it, create a new key and revoke this
          one.
        </span>
      </p>
      <div className="space-y-2">
        <label htmlFor="api-key-secret" className="text-sm font-medium">
          API key
        </label>
        <div className="flex gap-2">
          <Input
            id="api-key-secret"
            // The submit button that had focus is gone; this reads the key out with its label
            autoFocus
            readOnly
            value={secret}
            spellCheck={false}
            autoComplete="off"
            className="font-mono"
            aria-describedby="api-key-shown-once"
            onFocus={(event) => event.currentTarget.select()}
          />
          <Button type="button" variant="outline" onClick={copy}>
            {copied ? <Check aria-hidden /> : <Copy aria-hidden />} {copied ? "Copied" : "Copy"}
          </Button>
        </div>
        <p role="status" className="text-sm text-slate-600">
          {copied === true ? "Copied to the clipboard." : copied === false ? "Couldn't copy it: select the key and copy it yourself." : ""}
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

function RevokeApiKey({ apiKey, onClose }: { apiKey?: ApiKeyRow; onClose: () => void }) {
  const focusReturn = useFocusReturn()
  const { toast } = useToast()
  const [pending, setPending] = useState(false)
  // The last key shown, so the dialog keeps its name while it animates closed
  const [shown, setShown] = useState(apiKey)
  if (apiKey && apiKey !== shown) setShown(apiKey)
  const name = (apiKey ?? shown)?.name

  async function revoke(event: React.MouseEvent) {
    // Stays open until revoked, to show it's working
    event.preventDefault()
    if (!apiKey) return
    setPending(true)
    try {
      const result = await revokeApiKey(apiKey.id)
      if (result.ok) {
        toast({ title: "Key revoked", description: `Systems using ${apiKey.name} stop working within five minutes at most.` })
        // The action already refreshed the list
        onClose()
      } else {
        toast({ variant: "destructive", title: "Couldn't revoke the key", description: result.error })
      }
    } catch (failure) {
      console.error("Revoking an API key failed", failure)
      toast({ variant: "destructive", title: "Couldn't revoke the key", description: "The server didn't answer. Try again in a moment." })
    } finally {
      setPending(false)
    }
  }

  return (
    <AlertDialog open={Boolean(apiKey)} onOpenChange={(open) => !open && !pending && onClose()}>
      <AlertDialogContent {...focusReturn}>
        <AlertDialogHeader>
          <AlertDialogTitle className="break-words">Revoke {name}?</AlertDialogTitle>
          <AlertDialogDescription>
            Systems using this key stop working within five minutes at most, and it can&apos;t be restored. To replace it without an interruption,
            give the system a new key before revoking this one.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={pending}>Cancel</AlertDialogCancel>
          <AlertDialogAction onClick={revoke} disabled={pending} className={buttonVariants({ variant: "destructive" })}>
            {pending ? "Revoking..." : "Revoke key"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
