"use server"

import { revalidatePath } from "next/cache"
import type { Mutation, MutationDeleteThreadArgs } from "@/generated/graphql"
import { gql } from "@apollo/client"

import { getAdminClient } from "@/lib/adminApiClient"

export async function deleteThread(id: string) {
  const client = await getAdminClient()

  const { data } = await client.mutate<Mutation, MutationDeleteThreadArgs>({
    mutation: gql`
      mutation DeleteThread($id: ID!) {
        deleteThread(id: $id)
      }
    `,
    variables: { id },
  })

  revalidatePath("/admin/conversations", "layout")
  return data?.deleteThread
}
