import { randomUUID } from "node:crypto"
import { DeleteObjectCommand, GetObjectCommand, HeadBucketCommand, PutObjectCommand, S3Client, type S3ClientConfig } from "@aws-sdk/client-s3"
import { getSignedUrl } from "@aws-sdk/s3-request-presigner"
import { GraphQLError } from "graphql"

// Media storage (uploaded images and files) is optional. It is Amazon S3 by default, or S3-compatible storage at S3_ENDPOINT.
// A container installation's bundled storage sets these itself (src/container/config.ts):
// - S3_UPLOADS_BUCKET_NAME: the bucket. Without it media storage is off: uploads and downloads answer MEDIA_STORAGE_NOT_CONFIGURED
// - S3_ENDPOINT: the storage's URL, as the backend and the web app's server reach it. Unset, Amazon S3 with transfer acceleration
// - S3_PUBLIC_ENDPOINT: the URL browsers reach it at, which upload URLs are signed for when it differs from S3_ENDPOINT
// - S3_REGION (else AWS_REGION) and S3_FORCE_PATH_STYLE=true, which most S3-compatible servers need
// - S3_ACCESS_KEY_ID and S3_SECRET_ACCESS_KEY: the storage's own access key. Unset, credentials come from the standard AWS
//   chain (the Lambda's role, or AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY), which other AWS services such as SES use too

export const MEDIA_STORAGE_NOT_CONFIGURED = "MEDIA_STORAGE_NOT_CONFIGURED"

const bucketName = () => process.env.S3_UPLOADS_BUCKET_NAME?.trim() || undefined

export const isMediaStorageConfigured = () => bucketName() !== undefined

function mediaStorageNotConfigured() {
  return new GraphQLError(
    "Media storage isn't set up on this installation, so images and files can't be uploaded or shown. The operator sets S3_UPLOADS_BUCKET_NAME to turn it on.",
    { extensions: { code: MEDIA_STORAGE_NOT_CONFIGURED } }
  )
}

// The storage's own access key, when both halves are set
function storageCredentials(): Pick<S3ClientConfig, "credentials"> {
  const accessKeyId = process.env.S3_ACCESS_KEY_ID?.trim()
  const secretAccessKey = process.env.S3_SECRET_ACCESS_KEY?.trim()
  return accessKeyId && secretAccessKey ? { credentials: { accessKeyId, secretAccessKey } } : {}
}

function clientConfig(endpoint: string | undefined): S3ClientConfig {
  if (!endpoint) {
    return { useAccelerateEndpoint: true, region: process.env.S3_REGION || process.env.AWS_REGION, ...storageCredentials() }
  }

  return {
    ...storageCredentials(),
    endpoint,
    // S3-compatible servers mostly ignore the region, but requests must be signed for one
    region: process.env.S3_REGION || process.env.AWS_REGION || "us-east-1",
    forcePathStyle: process.env.S3_FORCE_PATH_STYLE === "true",
    // By default the SDK adds a CRC32 checksum to every request, and to a signed upload URL the checksum of an empty body,
    // which Amazon S3 ignores there. S3-compatible servers such as SeaweedFS check it against the file the browser then
    // sends and refuse the upload
    requestChecksumCalculation: "WHEN_REQUIRED",
    responseChecksumValidation: "WHEN_REQUIRED",
  }
}

// One client per process, so a warm Lambda reuses its kept-alive connection and resolved credentials. Upload URLs are signed
// with a client of their own when browsers reach the storage at another URL; signing makes no request
let s3Client: S3Client | undefined
let uploadSigningClient: S3Client | undefined

function getClient() {
  s3Client ??= new S3Client(clientConfig(process.env.S3_ENDPOINT?.trim() || undefined))
  return s3Client
}

function getUploadSigningClient() {
  const publicEndpoint = process.env.S3_PUBLIC_ENDPOINT?.trim()
  if (!publicEndpoint || !process.env.S3_ENDPOINT?.trim()) return getClient()

  uploadSigningClient ??= new S3Client(clientConfig(publicEndpoint))
  return uploadSigningClient
}

function requireBucket() {
  const bucket = bucketName()
  if (!bucket) throw mediaStorageNotConfigured()
  return bucket
}

type StorageError = { name?: string; $metadata?: { httpStatusCode?: number } }

// Whether the storage refused a request. Amazon S3 also answers a read of a missing key with 403 when the credentials lack
// s3:ListBucket, so a refused read may be a missing file as well as credentials without access
export function isAccessDenied(error: unknown) {
  const { name, $metadata } = (error ?? {}) as StorageError
  return name === "AccessDenied" || $metadata?.httpStatusCode === 403
}

// Whether the storage has no such bucket or key
function isNotFound(error: unknown) {
  const { name, $metadata } = (error ?? {}) as StorageError
  return name === "NotFound" || name === "NoSuchKey" || name === "NoSuchBucket" || $metadata?.httpStatusCode === 404
}

// Writes a small object under a key of its own and deletes it, which throws the storage's error unless it accepts this
// installation's writes and deletes
async function probeWriteAccess(abortSignal?: AbortSignal) {
  const Bucket = requireBucket()
  const Key = `lumi-access-check/${randomUUID()}`
  const client = getClient()
  await client.send(new PutObjectCommand({ Bucket, Key, Body: new TextEncoder().encode("Lumi media storage check"), ContentType: "text/plain" }), {
    abortSignal,
  })
  await client.send(new DeleteObjectCommand({ Bucket, Key }), { abortSignal })
}

// What is wrong with the media storage, for the operator, or undefined when it works. For the container's status command and
// the api service's start. `bundled` for the Compose installation's own storage, whose settings the operator never sees, so
// the advice names what they can check instead. Bounded, so it never waits long on storage that doesn't answer.
//
// HeadBucket needs s3:ListBucket on Amazon S3, which a key limited to the bucket's objects, as Lumi needs, doesn't have. Such
// a key is refused there, so a refusal is checked again by writing and deleting a small object, as an upload would
export async function describeStorageProblem({ bundled = false, timeoutMs = 10_000 } = {}): Promise<string | undefined> {
  const bucket = requireBucket()
  const abortSignal = AbortSignal.timeout(timeoutMs)
  try {
    try {
      await getClient().send(new HeadBucketCommand({ Bucket: bucket }), { abortSignal })
    } catch (error) {
      if (!isAccessDenied(error)) throw error
      await probeWriteAccess(abortSignal)
    }
    return undefined
  } catch (error) {
    const { $metadata } = (error ?? {}) as StorageError
    if (isNotFound(error)) {
      return bundled
        ? `the bucket ${bucket} doesn't exist: the storage service creates it when it starts, so restart it with docker compose restart storage`
        : `the bucket ${bucket} doesn't exist: create it in the storage, or correct S3_UPLOADS_BUCKET_NAME`
    }
    if (isAccessDenied(error)) {
      return bundled
        ? "the storage refused LUMI_STORAGE_SECRET_KEY: if you changed it in deploy/.env, run docker compose up -d so the storage service uses it too"
        : `the storage refused access to the bucket ${bucket}: check S3_ACCESS_KEY_ID and S3_SECRET_ACCESS_KEY, and that the key may read, write and delete its objects`
    }
    if ($metadata?.httpStatusCode) {
      return bundled
        ? `the storage answered ${$metadata.httpStatusCode} for the bucket ${bucket}: check the storage service's log (docker compose logs storage)`
        : `the storage answered ${$metadata.httpStatusCode} for the bucket ${bucket}: check S3_ENDPOINT, S3_REGION and S3_FORCE_PATH_STYLE`
    }
    const reason = error instanceof Error ? error.message || error.name : String(error)
    return bundled
      ? `the storage can't be reached (${reason}): check that the storage service is running and healthy (docker compose ps storage) and its log`
      : `the storage can't be reached (${reason}): check S3_ENDPOINT and that the storage is running`
  }
}

export default class S3Source {
  // Throws the GraphQL error that says media storage is off, before anything is recorded for an upload
  assertConfigured() {
    requireBucket()
  }

  async getSignedUploadUrl(key: string, contentType: string, expiresIn: number = 3600) {
    const command = new PutObjectCommand({
      Bucket: requireBucket(),
      Key: key,
      ContentType: contentType,
    })

    return getSignedUrl(getUploadSigningClient(), command, { expiresIn })
  }

  async getSignedDownloadUrl(key: string, expiresIn: number = 3600) {
    const command = new GetObjectCommand({
      Bucket: requireBucket(),
      Key: key,
    })

    return getSignedUrl(getClient(), command, { expiresIn })
  }

  // The stored file and its content type, or null when the storage has nothing under the key. For the container's export
  // command (src/container/businessExport.ts), which reads every image into the export file. A refused read throws: see
  // isAccessDenied
  async getFile(key: string): Promise<{ body: Uint8Array; contentType: string | undefined } | null> {
    try {
      const response = await getClient().send(new GetObjectCommand({ Bucket: requireBucket(), Key: key }))
      if (!response.Body) return null
      return { body: await response.Body.transformToByteArray(), contentType: response.ContentType }
    } catch (error) {
      if (isNotFound(error)) return null
      throw error
    }
  }

  // Stores a file under the key, replacing any there. For the container's import command
  async putFile(key: string, body: Uint8Array, contentType: string) {
    await getClient().send(new PutObjectCommand({ Bucket: requireBucket(), Key: key, Body: body, ContentType: contentType }))
  }

  // Checks that the storage accepts this installation's writes and deletes. Throws the storage's error otherwise. For the
  // container's import command, before it writes anything
  async checkWriteAccess() {
    await probeWriteAccess()
  }

  // Without media storage nothing can have been stored, so there is nothing to delete
  async deleteFile(key: string) {
    const bucket = bucketName()
    if (!bucket) {
      console.warn(`Media storage isn't configured: file ${key} not deleted`)
      return false
    }

    const command = new DeleteObjectCommand({
      Bucket: bucket,
      Key: key,
    })

    // A delete that fails throws. Only a versioned bucket, such as Nieve's, answers with a delete marker, so its absence is no failure
    await getClient().send(command)
    return true
  }
}
