import { isMediaStorageConfigured } from "@/apollo/sources/s3Source"
import type { Context } from "@/apollo/types"
import { Resolvers } from "@/generated/graphql"
import { isUploadImageType } from "@lumi/shared-contracts/media"
import { GraphQLError } from "graphql"

export const uploadsResolvers: Resolvers<Context> = {
  Query: {
    getDownloadUrl: async (_, { key }, context) => {
      const upload = await context.dataSources.db.getUploadKey(key)

      if (upload) {
        return {
          signedUrl: await context.dataSources.s3.getSignedDownloadUrl(key),
          contentType: upload.content_type,
        }
      } else {
        return null
      }
    },
    mediaStorageConfigured: () => isMediaStorageConfigured(),
  },
  Mutation: {
    createUpload: async (_, { contentType }, context) => {
      // The types the web app's media route serves (see UPLOAD_IMAGE_TYPES)
      if (!isUploadImageType(contentType)) {
        throw new GraphQLError("Only JPEG, PNG, WebP, GIF or AVIF images can be uploaded", { extensions: { code: "BAD_USER_INPUT" } })
      }
      // Nothing is recorded for an upload that has nowhere to go
      context.dataSources.s3.assertConfigured()
      const key = await context.dataSources.db.createUpload(contentType)
      const url = await context.dataSources.s3.getSignedUploadUrl(key, contentType)
      return { key, signedUrl: url }
    },
  },
}
