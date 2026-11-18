import { type NextRequest } from "next/server"
import type { Query, QueryGetDownloadUrlArgs } from "@/generated/graphql"
import { gql } from "@apollo/client"
import { isUploadImageType } from "@lumi/shared-contracts/media"
import sharp from "sharp"

import { getClient } from "@/lib/apiClient"
import { isMediaStorageNotConfigured } from "@/lib/mediaStorage"

interface IParams {
  params: Promise<{
    key: string
  }>
}

// Largest width or height a resize may ask for, so a request can't make the server render a huge image
const MAX_DIMENSION = 2000

// A w or h parameter as a whole number of pixels from 1 to MAX_DIMENSION, or undefined when missing or invalid
function dimension(value: string | null) {
  if (!value || !/^\d+$/.test(value)) return undefined
  const pixels = Number(value)
  return pixels >= 1 ? Math.min(pixels, MAX_DIMENSION) : undefined
}

const HEADERS = {
  "Cache-Control": "public, max-age=86400, s-maxage=86400",
  "X-Content-Type-Options": "nosniff",
}

export async function GET(req: NextRequest, { params }: IParams) {
  const { key } = await params
  const client = getClient()

  let signResponse
  try {
    signResponse = await client
      .query<Query, QueryGetDownloadUrlArgs>({
        query: gql`
          query Query($key: String!) {
            getDownloadUrl(key: $key) {
              signedUrl
              contentType
            }
          }
        `,
        variables: { key },
        fetchPolicy: "no-cache",
      })
      .then(({ data }) => data?.getDownloadUrl)
  } catch (error) {
    // Without media storage, which a self-hosted installation may not configure, there are no images to show
    if (isMediaStorageNotConfigured(error)) return new Response(null, { status: 404 })
    console.error(`Couldn't sign the download of media ${key}`, error)
    return new Response(null, { status: 502 })
  }

  const contentType = signResponse?.contentType?.split(";")[0].trim().toLowerCase()
  // Only the raster images uploads accept are served. Anything else stored under a key, e.g. HTML or an SVG with scripts, would
  // run on the app's origin if a browser rendered it, so it's treated as missing
  if (!signResponse || !contentType || !isUploadImageType(contentType)) {
    return new Response(null, { status: 404 })
  }

  const response = await fetch(signResponse.signedUrl)
  if (!response.ok) {
    console.error(`Couldn't download media ${key}: ${response.status} ${response.statusText}`)
    return new Response("Failed to fetch the media", { status: 500 })
  }
  if (!response.body) {
    return new Response(null, { status: 204 })
  }

  const searchParams = req.nextUrl.searchParams
  const width = dimension(searchParams.get("w"))
  const height = dimension(searchParams.get("h"))

  if (width || height) {
    const imageBuffer = Buffer.from(await response.arrayBuffer())
    const processedBuffer = await sharp(imageBuffer).resize({ width, height, fit: "cover" }).webp().toBuffer()

    return new Response(new Uint8Array(processedBuffer), {
      headers: {
        ...HEADERS,
        "Content-Type": "image/webp",
        "Content-Length": processedBuffer.byteLength.toString(),
        Etag: key,
      },
      status: 200,
    })
  }

  const contentLength = response.headers.get("Content-Length")
  return new Response(response.body, {
    headers: {
      ...HEADERS,
      "Content-Type": contentType,
      ...(contentLength && { "Content-Length": contentLength }),
      Etag: key,
    },
    status: 200,
  })
}
