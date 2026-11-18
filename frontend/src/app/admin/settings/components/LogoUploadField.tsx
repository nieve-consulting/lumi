"use client"

import { useRef, useState } from "react"
import { isUploadImageType, UPLOAD_IMAGE_TYPES } from "@lumi/shared-contracts/media"
import { ImageUp, Trash2 } from "lucide-react"

import { sizedImage } from "@/lib/mediaImage"
import { Button } from "@/components/ui/button"
import { describedBy, FieldError, FieldHint, TextField } from "@/components/BusinessSettings/fields"
import { fieldId, type FieldErrors } from "@/components/BusinessSettings/form"
import { MediaStorageNotConfiguredError, uploadImage } from "@/app/admin/uploads"

// The logo of a settings form (the business settings' appearance, the resume settings): uploaded, or entered as an address

export type LogoUpload = ReturnType<typeof useLogoUpload>

interface UploadOptions {
  // What the logo is called in a failure, e.g. "resume logo"
  what: string
  // What the field announces once the logo is uploaded
  uploadedMessage: string
  // Receives the upload's path, /media/<key>
  onUploaded: (url: string) => void
}

// The state of a logo upload. The form keeps it rather than the field, so it outlives the field, e.g. while the business
// settings show another section, and the form can wait for the upload before saving
export function useLogoUpload({ what, uploadedMessage, onUploaded }: UploadOptions) {
  const [uploading, setUploading] = useState(false)
  const [failure, setFailure] = useState<string>()
  // What happened to the logo since the last save, announced: uploaded or removed
  const [status, setStatus] = useState<string>()
  // Whether the admin is typing an address, which keeps the text box even once it reads like an upload's /media/ path
  const [typing, setTyping] = useState(false)
  // Stops a second upload starting before the first one's state has rendered
  const inFlight = useRef(false)

  async function upload(file: File) {
    if (inFlight.current) return
    setFailure(undefined)
    setStatus(undefined)
    if (!isUploadImageType(file.type)) {
      setFailure("Upload a JPEG, PNG, WebP, GIF or AVIF image, or enter the logo's https address.")
      return
    }
    inFlight.current = true
    setUploading(true)
    try {
      const key = await uploadImage(file, what)
      setTyping(false)
      onUploaded(`/media/${key}`)
      setStatus(uploadedMessage)
    } catch (error) {
      setFailure(
        error instanceof MediaStorageNotConfiguredError
          ? "Logos can't be uploaded because media storage isn't set up for this Lumi installation. Enter the logo's https address instead, or ask whoever set up Lumi to set up media storage."
          : error instanceof Error
            ? error.message
            : `The ${what} couldn't be uploaded. Try again.`
      )
    } finally {
      inFlight.current = false
      setUploading(false)
    }
  }

  return {
    uploading,
    failure,
    status,
    typing,
    upload,
    // The admin typed in the address box
    typed() {
      setTyping(true)
      setStatus(undefined)
      setFailure(undefined)
    },
    removed() {
      setTyping(false)
      setFailure(undefined)
      setStatus("Logo removed. Save to show your business name instead.")
    },
    // A save settles what the field announced; an address being typed keeps its text box
    saved() {
      setStatus(undefined)
      setFailure(undefined)
    },
    // A discard also returns the logo to the saved one, shown as an image if it was uploaded
    discarded() {
      setStatus(undefined)
      setFailure(undefined)
      setTyping(false)
    },
  }
}

interface IProps {
  label: string
  // The uploaded image's alternative text
  alt: string
  // With an address, and with an uploaded logo
  hint: string
  uploadedHint: string
  placeholder: string
  value: string
  onChange: (value: string) => void
  errors: FieldErrors
  logo: LogoUpload
  // While the form saves or the logo uploads
  disabled: boolean
  // The colour and height the logo is shown at where it's used
  background: string
  height: number
}

export default function LogoUploadField({
  label,
  alt,
  hint,
  uploadedHint,
  placeholder,
  value,
  onChange,
  errors,
  logo,
  disabled,
  background,
  height,
}: IProps) {
  const fileInput = useRef<HTMLInputElement>(null)
  // The uploaded logo that couldn't be loaded, e.g. once removed from the media storage
  const [failedLogo, setFailedLogo] = useState<string>()

  const logoUrl = value.trim()
  // An image uploaded here, which the web app serves at /media/<key>, rather than an address the admin is entering
  const uploadedLogo = logoUrl.startsWith("/media/") && !logo.typing

  return (
    // With an uploaded logo the image, its hint and its buttons read as one labelled group
    <div
      className="space-y-3"
      {...(uploadedLogo && {
        role: "group",
        "aria-labelledby": fieldId("logoUrl"),
        "aria-describedby": describedBy("logoUrl", errors, uploadedHint),
      })}
    >
      {uploadedLogo ? (
        // An uploaded logo shows as the image, on the colour it's shown on; an address the admin entered stays editable as text
        <div className="space-y-2">
          {/* Focusable, so a save that finds a problem with the logo can take the admin to it */}
          <p id={fieldId("logoUrl")} tabIndex={-1} className="text-sm leading-none font-medium">
            {label}
          </p>
          <FieldHint field="logoUrl">{uploadedHint}</FieldHint>
          <div
            className="flex h-20 w-full max-w-xs items-center justify-center rounded-md border border-slate-200 px-3"
            style={{ backgroundColor: background }}
          >
            {failedLogo === logoUrl ? (
              <p className="rounded bg-white px-2 py-1 text-sm text-slate-700">The logo couldn&apos;t be loaded. Upload it again, or remove it.</p>
            ) : (
              // eslint-disable-next-line @next/next/no-img-element -- an upload served by the web app's /media route
              <img
                src={sizedImage(logoUrl, height)}
                alt={alt}
                className="max-w-full object-contain"
                style={{ height }}
                onError={() => setFailedLogo(logoUrl)}
              />
            )}
          </div>
          <FieldError field="logoUrl" errors={errors} />
        </div>
      ) : (
        <TextField
          field="logoUrl"
          label={label}
          hint={hint}
          type="url"
          placeholder={placeholder}
          value={value}
          onChange={(next) => {
            onChange(next)
            logo.typed()
          }}
          errors={errors}
        />
      )}
      <div className="flex flex-wrap items-center gap-2">
        <input
          ref={fileInput}
          type="file"
          accept={UPLOAD_IMAGE_TYPES.join(",")}
          className="sr-only"
          tabIndex={-1}
          aria-hidden
          onChange={(event) => {
            const file = event.target.files?.[0]
            // So the same file can be picked again, e.g. after a failure
            event.target.value = ""
            if (file) logo.upload(file)
          }}
        />
        <Button type="button" variant="outline" size="sm" disabled={disabled} onClick={() => fileInput.current?.click()}>
          <ImageUp aria-hidden />
          {logo.uploading ? "Uploading…" : logoUrl ? "Upload a new logo" : "Upload a logo"}
        </Button>
        {logoUrl && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={disabled}
            onClick={() => {
              onChange("")
              logo.removed()
              requestAnimationFrame(() => document.getElementById(fieldId("logoUrl"))?.focus())
            }}
          >
            <Trash2 aria-hidden /> Remove logo
          </Button>
        )}
      </div>
      <p role="status" className="text-sm text-slate-600">
        {logo.uploading ? "Uploading the logo…" : logo.status}
      </p>
      {logo.failure && (
        <p role="alert" className="text-sm font-medium text-red-700">
          {logo.failure}
        </p>
      )}
    </div>
  )
}
