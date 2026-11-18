"use client"

import { useMemo } from "react"
import { useRouter } from "next/navigation"
import { Website } from "@/generated/graphql"
import { zodResolver } from "@hookform/resolvers/zod"
import { WEBSITE_CRAWL_LIMITS } from "@lumi/shared-contracts/knowledge"
import { useForm, useWatch } from "react-hook-form"

import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form"
import { Input } from "@/components/ui/input"
import { LoadingButton, LoadingButtonState } from "@/components/ui/loading-button"
import { Textarea } from "@/components/ui/textarea"
import { useToast } from "@/components/ui/use-toast"

import { addWebsite, updateWebsite } from "../../actions"
import Exclude from "./Exclude"
import { websiteSchema, type WebsiteFormSchema } from "./schema"

const numberFormat = new Intl.NumberFormat("en")

interface IProps {
  website?: Website
}

export default function WebsiteForm({ website }: IProps) {
  const { toast } = useToast()
  const router = useRouter()

  const defaultValues: WebsiteFormSchema = useMemo(
    () => ({
      name: website?.name || "",
      description: website?.description || "",
      url: website?.url || "",
      sitemap: website?.sitemap || "",
      exclude_paths: (website?.exclude_paths ?? []).map((p) => ({ path: p })) as WebsiteFormSchema["exclude_paths"],
    }),
    [website]
  )

  const form = useForm<WebsiteFormSchema>({
    resolver: zodResolver(websiteSchema),
    defaultValues,
    mode: "onChange",
  })

  const url = useWatch({ control: form.control, name: "url" })

  async function onSubmit(data: WebsiteFormSchema) {
    let result
    try {
      result = website ? await updateWebsite(website.id, data) : await addWebsite(data)
    } catch (e) {
      // The action itself failed, as when the network is down
      console.error(e)
      result = { ok: false as const, error: "The website couldn't be saved. Try again in a moment." }
    }

    if (!result.ok) {
      // Such as a private or local URL the API refused: next to its field when the API names it, otherwise next to the button
      if ("field" in result && result.field) form.setError(result.field, { message: result.error }, { shouldFocus: true })
      else form.setError("root.server", { message: result.error })
      return
    }

    toast({ title: website ? `${data.name} has been updated` : `${data.name} has been created` })
    router.replace("/admin/websites")
  }

  const serverError = form.formState.errors.root?.server?.message

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8">
        <div className="flex gap-2">
          <FormField
            control={form.control}
            name="name"
            render={({ field }) => (
              <FormItem className="flex-grow">
                <FormLabel>Name</FormLabel>
                <FormControl>
                  <Input {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="url"
            render={({ field }) => (
              <FormItem className="flex-grow">
                <FormLabel>Website URL</FormLabel>
                <FormControl>
                  <Input {...field} inputMode="url" placeholder="https://www.example.com" />
                </FormControl>
                <FormDescription>A public address. Private and local network addresses are refused.</FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>
        <div>
          <FormField
            control={form.control}
            name="sitemap"
            render={({ field }) => (
              <FormItem className="flex-grow">
                <FormLabel>Sitemap Path</FormLabel>
                <div className="flex items-center justify-between">
                  <div className="rounded-l-md bg-slate-200 p-2 pr-0" aria-hidden>
                    {url}/
                  </div>
                  <FormControl>
                    <Input {...field} placeholder="sitemap.xml" className="rounded-l-none pl-0" />
                  </FormControl>
                </div>
                <FormDescription>
                  The path of your sitemap or sitemap index, such as sitemap.xml. Each crawl checks up to{" "}
                  {numberFormat.format(WEBSITE_CRAWL_LIMITS.maxPages)} pages, and an index can list up to {WEBSITE_CRAWL_LIMITS.maxSitemaps} sitemaps.
                  Pages listed with a last-modified date are crawled again when it changes; pages without one are checked for changes in their
                  content. Each sitemap or page must be under {WEBSITE_CRAWL_LIMITS.maxBytes / (1024 * 1024)} MB and load within{" "}
                  {WEBSITE_CRAWL_LIMITS.timeoutMs / 1000} seconds.
                </FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>
        <FormField
          control={form.control}
          name="description"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Description</FormLabel>
              <FormControl>
                <Textarea {...field} className="h-20" />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <Exclude form={form} />

        {serverError && (
          <p role="alert" className="text-right text-sm font-medium text-red-700">
            {serverError}
          </p>
        )}
        <div className="w-full text-right">
          <LoadingButton
            state={form.formState.isSubmitting ? LoadingButtonState.Loading : LoadingButtonState.Idle}
            type="submit"
            text={website ? "Save Changes" : "Create Website"}
            loadingText={website ? "Saving..." : "Creating..."}
          />
        </div>
      </form>
    </Form>
  )
}
