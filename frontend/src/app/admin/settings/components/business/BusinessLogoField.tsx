"use client"

import { useRef, useState } from "react"
import { isUploadImageType, UPLOAD_IMAGE_TYPES } from "@lumi/shared-contracts/media"
import { ImageUp, Trash2 } from "lucide-react"

import { Button } from "@/components/ui/button"
import { describedBy, FieldError, FieldHint, TextField } from "@/components/BusinessSettings/fields"
import { fieldId, type FieldErrors } from "@/components/BusinessSettings/form"
import { MediaStorageNotConfiguredError, uploadImage } from "@/app/admin/uploads"

// The business logo in the admin settings' appearance section: uploaded like the resume logo, or entered as an address. The
// onboarding wizard only takes an address, as it runs before an admin can sign in to upload

// The About dialog shows the logo 35 pixels tall after "<assistant> by", on white
const LOGO_TIPS =
  "Shown in the chat's About dialog, about 35 pixels tall on a white background. A wide logo with little margin reads best. Without one, the dialog shows your business name."

const LOGO_HINT = `${LOGO_TIPS} Upload a JPEG, PNG, WebP, GIF or AVIF image, or enter its https address or a path on this site starting with /.`

const UPLOADED_LOGO_HINT = `${LOGO_TIPS} To use an image address instead, remove this logo.`

interface IProps {
  value: string
  // Changes when the form saves or discards, which settles what the field announced about an upload or a removal. The field
  // stays mounted, so an input saved with Enter keeps its focus
  resetKey: number
  onChange: (value: string) => void
  // Whether an upload is under way, so the form doesn't save while it is
  onUploadingChange: (uploading: boolean) => void
  errors: FieldErrors
}

export default function BusinessLogoField({ value, resetKey, onChange, onUploadingChange, errors }: IProps) {
  const [uploading, setUploading] = useState(false)
  const [uploadFailure, setUploadFailure] = useState<string>()
  // What happened to the logo since the last save, announced: uploaded or removed
  const [logoStatus, setLogoStatus] = useState<string>()
  const [settledKey, setSettledKey] = useState(resetKey)
  const fileInput = useRef<HTMLInputElement>(null)

  // Adjusted while rendering rather than in an effect, so the cleared messages never show
  if (resetKey !== settledKey) {
    setSettledKey(resetKey)
    setLogoStatus(undefined)
    setUploadFailure(undefined)
  }

  const logoUrl = value.trim()
  // An image uploaded here, which the web app serves at /media/<key>, rather than an address the admin entered
  const uploadedLogo = logoUrl.startsWith("/media/")

  async function uploadLogo(file: File) {
    setUploadFailure(undefined)
    setLogoStatus(undefined)
    if (!isUploadImageType(file.type)) {
      setUploadFailure("Upload a JPEG, PNG, WebP, GIF or AVIF image, or enter the logo's https address.")
      if (fileInput.current) fileInput.current.value = ""
      return
    }
    setUploading(true)
    onUploadingChange(true)
    try {
      const key = await uploadImage(file, "logo")
      onChange(`/media/${key}`)
      setLogoStatus("Logo uploaded. Save to show it in the chat.")
    } catch (error) {
      setUploadFailure(
        error instanceof MediaStorageNotConfiguredError
          ? "Logos can't be uploaded because media storage isn't set up for this Lumi installation. Enter the logo's https address instead, or ask whoever set up Lumi to set up media storage."
          : error instanceof Error
            ? error.message
            : "The logo couldn't be uploaded. Try again."
      )
    } finally {
      setUploading(false)
      onUploadingChange(false)
      // The same file can be picked again after a failure
      if (fileInput.current) fileInput.current.value = ""
    }
  }

  return (
    // With an uploaded logo the image, its hint and its buttons read as one labelled group
    <div
      className="space-y-3"
      {...(uploadedLogo && {
        role: "group",
        "aria-labelledby": fieldId("logoUrl"),
        "aria-describedby": describedBy("logoUrl", errors, UPLOADED_LOGO_HINT),
      })}
    >
      {uploadedLogo ? (
        // An uploaded logo shows as the image, on the white the About dialog shows it on; an address the admin entered stays
        // editable as text
        <div className="space-y-2">
          {/* Focusable, so a save that finds a problem with the logo can take the admin to it */}
          <p id={fieldId("logoUrl")} tabIndex={-1} className="text-sm leading-none font-medium">
            Logo
          </p>
          <FieldHint field="logoUrl">{UPLOADED_LOGO_HINT}</FieldHint>
          <div className="flex h-20 w-full max-w-xs items-center justify-center rounded-md border border-slate-200 bg-white px-3">
            {/* eslint-disable-next-line @next/next/no-img-element -- an upload served by the web app's /media route */}
            <img src={logoUrl} alt="Uploaded logo" className="h-[35px] max-w-full object-contain" />
          </div>
          <FieldError field="logoUrl" errors={errors} />
        </div>
      ) : (
        <TextField
          field="logoUrl"
          label="Logo"
          hint={LOGO_HINT}
          type="url"
          placeholder="https://www.example.com/logo.png"
          value={value}
          onChange={(next) => {
            onChange(next)
            setLogoStatus(undefined)
            setUploadFailure(undefined)
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
            if (file) uploadLogo(file)
          }}
        />
        <Button type="button" variant="outline" size="sm" disabled={uploading} onClick={() => fileInput.current?.click()}>
          <ImageUp aria-hidden />
          {uploading ? "Uploading…" : logoUrl ? "Upload a new logo" : "Upload a logo"}
        </Button>
        {logoUrl && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={uploading}
            onClick={() => {
              onChange("")
              setLogoStatus("Logo removed. Save to show your business name instead.")
              requestAnimationFrame(() => document.getElementById(fieldId("logoUrl"))?.focus())
            }}
          >
            <Trash2 aria-hidden /> Remove logo
          </Button>
        )}
      </div>
      <p role="status" className="text-sm text-slate-600">
        {uploading ? "Uploading the logo…" : logoStatus}
      </p>
      {uploadFailure && (
        <p role="alert" className="text-sm font-medium text-red-700">
          {uploadFailure}
        </p>
      )}
    </div>
  )
}
