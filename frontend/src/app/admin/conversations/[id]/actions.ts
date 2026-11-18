"use server"

import { revalidatePath } from "next/cache"
import type { Enquiry, Mutation, MutationRetryEnquiryDeliveryArgs } from "@/generated/graphql"
import { gql } from "@apollo/client"
import { CombinedGraphQLErrors } from "@apollo/client/errors"

import { getAdminClient } from "@/lib/adminApiClient"
import { apiErrorOf } from "@/lib/auth/localAccounts"

import { ENQUIRY_FRAGMENT } from "./enquiryQuery"

export type RetryDeliveryResult = { ok: true; enquiry: Enquiry } | { ok: false; error: string }

// Sends the enquiry again through each current channel that hasn't delivered it, and returns it with the new delivery states
export async function retryDelivery(id: string): Promise<RetryDeliveryResult> {
  const client = await getAdminClient()

  try {
    const { data } = await client.mutate<Mutation, MutationRetryEnquiryDeliveryArgs>({
      mutation: gql`
        mutation RetryEnquiryDelivery($id: ID!) {
          retryEnquiryDelivery(id: $id) {
            ...EnquiryFields
          }
        }
        ${ENQUIRY_FRAGMENT}
      `,
      variables: { id },
      fetchPolicy: "no-cache",
    })
    if (!data?.retryEnquiryDelivery) throw new Error("The API answered without data")
    // The list's "Enquiry not delivered" badge follows
    revalidatePath("/admin/conversations")
    return { ok: true, enquiry: data.retryEnquiryDelivery }
  } catch (error) {
    const refusal = apiErrorOf(error)
    if (refusal?.code === "NOT_FOUND") return { ok: false, error: "This enquiry no longer exists. Reload the page." }
    if (refusal?.code === "BAD_USER_INPUT") {
      // The API's own reason when it's about something else than the missing channel this explains
      const message = CombinedGraphQLErrors.is(error) ? error.errors[0]?.message : undefined
      return {
        ok: false,
        error:
          message && !/channel/i.test(message) ? message : "No delivery channel is set up. Add one in Settings → Enquiries & booking, then retry.",
      }
    }
    console.error("Retrying the enquiry delivery failed", refusal?.code ?? (error as Error).message)
    return { ok: false, error: "The delivery couldn't be retried: the server didn't answer. Try again in a moment." }
  }
}
