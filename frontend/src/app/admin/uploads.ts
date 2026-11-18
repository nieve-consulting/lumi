import { createUpload, isMediaStorageConfigured } from "./actions"

// Image uploads of the admin forms. Media storage is optional in a self-hosted installation: without it, the forms find out
// before saving anything, remove the picked images and say so, so the admin can save without them

// Thrown when the installation has no media storage. The forms catch it to remove the images they had picked
export class MediaStorageNotConfiguredError extends Error {
  constructor(images = 1) {
    super(
      `Images can't be uploaded because media storage isn't set up for this Lumi installation. ${images > 1 ? "The new images were removed, so you can save without them" : "The new image was removed, so you can save without it"}. To add images, ask whoever set up Lumi to set up media storage.`
    )
    this.name = "MediaStorageNotConfiguredError"
  }
}

// An image that couldn't be uploaded for another reason, e.g. the storage didn't accept it
export class ImageUploadError extends Error {
  constructor(what: string) {
    super(`The ${what} couldn't be uploaded. Try again.`)
    this.name = "ImageUploadError"
  }
}

// Uploads an image and returns its key for linking it to a record
export async function uploadImage(file: File, what = "image") {
  const result = await createUpload(file.type).catch(() => undefined)
  if (result && "error" in result) throw new MediaStorageNotConfiguredError()
  if (!result) throw new ImageUploadError(what)

  // A storage the browser can't reach, or that refuses the request (e.g. CORS), fails the fetch itself
  const response = await fetch(result.signedUrl, { method: "PUT", body: file }).catch(() => undefined)
  if (!response?.ok) throw new ImageUploadError(what)
  return result.key
}

// Checks, before a form saves anything, that the images it picked can be uploaded, so a missing media storage doesn't leave a
// record half saved, e.g. created without its image while the form stays open to be submitted again
export async function assertImageUploads(files: unknown[]) {
  const images = files.filter((candidate): candidate is File => candidate instanceof File)
  if (!images.length) return
  const configured = await isMediaStorageConfigured().catch(() => undefined)
  if (configured === false) throw new MediaStorageNotConfiguredError(images.length)
  if (configured === undefined) throw new ImageUploadError(images.length > 1 ? "images" : "image")
}

// Waits for the saves that follow creating a record. The record exists by then, so images that couldn't be uploaded don't fail
// the form, which would invite creating it again: the answer says whether they all were. Any other failure is thrown
export async function settleAfterCreate(promises: Promise<unknown>[]) {
  const failures = (await Promise.allSettled(promises)).flatMap((result) => (result.status === "rejected" ? [result.reason] : []))
  const other = failures.find((failure) => !(failure instanceof ImageUploadError || failure instanceof MediaStorageNotConfiguredError))
  if (other) throw other
  return failures.length === 0
}
