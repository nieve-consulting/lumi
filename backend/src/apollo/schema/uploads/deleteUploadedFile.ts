import type { Context } from "@/apollo/types"

// Deletes an uploaded file no record uses any more: the file in media storage, then its upload record. Call it only once the
// record that used it is deleted or points at another upload. Never throws: by then that change is saved, so a failure is
// logged rather than reported as the change failing. When storage can't delete the file the upload record is kept, so the
// leftover can still be found and deleted later rather than sit in storage with nothing pointing at it
export async function deleteUploadedFile(context: Context, key: string) {
  try {
    await context.dataSources.s3.deleteFile(key)
  } catch (error) {
    console.error(`Couldn't delete the file of upload ${key} from media storage, so its record is kept`, (error as Error).message)
    return
  }

  if (!(await context.dataSources.db.deleteUpload(key))) {
    console.error(`Deleted the file of upload ${key}, but couldn't delete its record`)
  }
}
