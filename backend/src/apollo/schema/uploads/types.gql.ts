export const uploadsTypeDefs = /* GraphQL */ `
  type CreateUploadResponse {
    signedUrl: String!
    key: String!
  }

  type GetUploadResponse {
    signedUrl: String!
    contentType: String
  }

  type Query {
    getDownloadUrl(key: String!): GetUploadResponse
    "Whether this installation has media storage, so images can be uploaded. Checks the configuration only: records nothing"
    mediaStorageConfigured: Boolean!
  }

  type Mutation {
    createUpload(contentType: String!): CreateUploadResponse!
  }
`
