"use server"

import type { Mutation, MutationCreateUploadArgs, Query } from "@/generated/graphql"
import { gql } from "@apollo/client"

import { getAdminClient } from "@/lib/adminApiClient"
import { isMediaStorageNotConfigured } from "@/lib/mediaStorage"

// Whether the installation has media storage, asked before a form saves anything. Records nothing, unlike createUpload
export async function isMediaStorageConfigured(): Promise<boolean> {
  const client = await getAdminClient()
  const { data } = await client.query<Pick<Query, "mediaStorageConfigured">>({
    query: gql`
      query MediaStorageConfigured {
        mediaStorageConfigured
      }
    `,
    fetchPolicy: "no-cache",
  })
  if (typeof data?.mediaStorageConfigured !== "boolean") throw new Error("The API didn't say whether media storage is configured")
  return data.mediaStorageConfigured
}

// Where to upload an image, or why it can't be: the installation has no media storage. A server action's thrown message
// doesn't reach the browser in production, so that case is an answer
export async function createUpload(
  contentType: string
): Promise<{ key: string; signedUrl: string } | { error: "mediaStorageNotConfigured" } | undefined> {
  const client = await getAdminClient()

  try {
    const { data } = await client.mutate<Mutation, MutationCreateUploadArgs>({
      mutation: gql`
        mutation CreateUpload($contentType: String!) {
          createUpload(contentType: $contentType) {
            key
            signedUrl
          }
        }
      `,
      variables: {
        contentType,
      },
    })

    return data?.createUpload
  } catch (error) {
    if (isMediaStorageNotConfigured(error)) return { error: "mediaStorageNotConfigured" }
    throw error
  }
}
