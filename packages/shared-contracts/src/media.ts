// The images admins can upload (the admin forms' FileUpload, GraphQL createUpload) and the web app's /media route serves.
// Raster images only: the files are served from the app's origin, where HTML or SVG could run scripts
export const UPLOAD_IMAGE_TYPES: readonly string[] = ["image/jpeg", "image/png", "image/webp", "image/gif", "image/avif"]

export const isUploadImageType = (contentType: string) => UPLOAD_IMAGE_TYPES.includes(contentType)
