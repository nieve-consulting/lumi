"use server"

import { revalidatePath } from "next/cache"
import {
  WebsiteCrawlKind,
  type Mutation,
  type MutationClearProcessedWebsitePagesArgs,
  type MutationCreateWebsiteArgs,
  type MutationDeleteWebsiteArgs,
  type MutationUpdateWebsiteArgs,
  type MutationUpdateWebsitePagesArgs,
} from "@/generated/graphql"
import { gql } from "@apollo/client"
import { CombinedGraphQLErrors } from "@apollo/client/errors"

import { getAdminClient } from "@/lib/adminApiClient"
import { requireAdminAccess } from "@/lib/auth/admin"

import { type WebsiteFormSchema } from "./components/form/schema"

// The website form's fields the API names when it refuses one, so the form shows the reason next to it
const FORM_FIELDS = ["url", "sitemap"] as const
type FormField = (typeof FORM_FIELDS)[number]

// Result of an action the admin can act on the failure of. Next.js hides the message of an error a server action throws in
// production, so the reason it failed is returned instead, with the form field it's about when the API names one
type Failure = { ok: false; error: string; field?: FormField }
type ActionResult<T extends object = object> = ({ ok: true } & T) | Failure

// The messages of the errors the admin can act on, such as a crawl still running or a private URL; anything else gets the
// fallback
function failure(error: unknown, fallback: string): Failure {
  const userErrors = CombinedGraphQLErrors.is(error) ? error.errors.filter(({ extensions }) => extensions?.code === "BAD_USER_INPUT") : []
  if (!userErrors.length) return { ok: false, error: fallback }
  const named = userErrors[0].extensions?.field
  const field = FORM_FIELDS.find((formField) => formField === named)
  return { ok: false, error: userErrors.map(({ message }) => message).join(" "), ...(field && userErrors.length === 1 ? { field } : {}) }
}

const websiteInput = (website: WebsiteFormSchema) => ({ ...website, exclude_paths: website.exclude_paths?.map((p) => p.path) })

// The API refuses URLs that aren't public http(s) addresses, such as private or local networks
export async function addWebsite(website: WebsiteFormSchema): Promise<ActionResult<{ id: string }>> {
  const client = await getAdminClient()

  try {
    const { data } = await client.mutate<Mutation, MutationCreateWebsiteArgs>({
      mutation: gql`
        mutation CreateWebsite($input: WebsiteInput!) {
          createWebsite(input: $input)
        }
      `,
      variables: { input: websiteInput(website) },
    })

    revalidatePath("/admin/websites", "layout")
    return data?.createWebsite ? { ok: true, id: data.createWebsite } : failure(null, "The website couldn't be created")
  } catch (error) {
    return failure(error, "The website couldn't be created. Try again in a moment.")
  }
}

export async function updateWebsite(id: string, website: WebsiteFormSchema): Promise<ActionResult> {
  const client = await getAdminClient()

  try {
    const { data } = await client.mutate<Mutation, MutationUpdateWebsiteArgs>({
      mutation: gql`
        mutation UpdateWebsite($id: ID!, $input: WebsiteInput!) {
          updateWebsite(id: $id, input: $input)
        }
      `,
      variables: { id, input: websiteInput(website) },
    })

    revalidatePath("/admin/websites", "layout")
    return data?.updateWebsite ? { ok: true } : failure(null, "The website couldn't be saved")
  } catch (error) {
    return failure(error, "The website couldn't be saved. Try again in a moment.")
  }
}

export async function deleteWebsite(id: string) {
  const client = await getAdminClient()

  const { data } = await client.mutate<Mutation, MutationDeleteWebsiteArgs>({
    mutation: gql`
      mutation DeleteWebsite($id: ID!) {
        deleteWebsite(id: $id)
      }
    `,
    variables: { id },
  })

  revalidatePath("/admin/websites", "layout")
  return data?.deleteWebsite
}

// The crawl's model usage is recorded with the admin's own calls. Re-process passes REPROCESS once it cleared the pages, so
// the crawl is labelled as such
export async function updateWebsitePages(id: string, kind: WebsiteCrawlKind = WebsiteCrawlKind.Update): Promise<ActionResult> {
  const client = await getAdminClient()
  const user = await requireAdminAccess()

  try {
    const { data } = await client.mutate<Mutation, MutationUpdateWebsitePagesArgs>({
      mutation: gql`
        mutation ($id: ID!, $adminEmail: String, $kind: WebsiteCrawlKind) {
          updateWebsitePages(id: $id, adminEmail: $adminEmail, kind: $kind)
        }
      `,
      variables: { id, adminEmail: user.email, kind },
    })

    return data?.updateWebsitePages ? { ok: true } : failure(null, "Failed to start updating the pages")
  } catch (error) {
    return failure(error, "Failed to start updating the pages")
  }
}

export async function clearWebsitePages(id: string): Promise<ActionResult> {
  const client = await getAdminClient()

  try {
    const { data } = await client.mutate<Mutation, MutationClearProcessedWebsitePagesArgs>({
      mutation: gql`
        mutation ($id: ID!) {
          clearProcessedWebsitePages(id: $id)
        }
      `,
      variables: { id },
    })

    return data?.clearProcessedWebsitePages ? { ok: true } : failure(null, "Failed to clear processed pages")
  } catch (error) {
    return failure(error, "Failed to clear processed pages")
  }
}
