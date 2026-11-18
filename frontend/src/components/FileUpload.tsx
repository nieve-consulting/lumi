import React, { useState } from "react"
import Image from "next/image"
import { Upload } from "lucide-react"

import { cn } from "@/lib/utils"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"

interface IProps {
  fallback: React.JSX.Element
  className?: string
  imageSrc?: string
  uploadCta?: string
  variant?: "circle" | "square"
  // Shows the image without letting it be changed
  disabled?: boolean
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void
}

export default function FileUpload({ imageSrc, className, fallback, onChange, uploadCta = "Upload", variant = "circle", disabled = false }: IProps) {
  const [internalImageSrc, setInternalImageSrc] = useState(imageSrc)

  function internalOnChange(e: React.ChangeEvent<HTMLInputElement>) {
    onChange(e)
    const file = e.target.files?.[0]
    if (file) {
      const reader = new FileReader()
      reader.onloadend = () => {
        if (reader.result) {
          setInternalImageSrc(reader.result.toString())
        }
      }
      reader.readAsDataURL(file)
    }
  }

  return (
    <Avatar className={cn("group mr-6 size-36", className)}>
      {variant === "circle" ? (
        <>
          <AvatarImage src={internalImageSrc} />
          <AvatarFallback>{fallback}</AvatarFallback>
        </>
      ) : internalImageSrc ? (
        <div className="relative h-full w-full">
          <Image src={internalImageSrc} alt="Image" fill objectFit="cover" className="aspect-square object-center" />
        </div>
      ) : (
        <div className="flex h-full w-full items-center justify-center bg-gray-200">{fallback}</div>
      )}
      <div className={cn("bg-opacity-50 absolute hidden size-full content-center rounded-lg bg-black", !disabled && "group-hover:block")}>
        <label className="block cursor-pointer rounded px-4 py-2 text-center font-bold text-white">
          <Upload className="inline" />
          <br />
          {uploadCta}
          <input
            type="file"
            accept=".jpg,.jpeg,.png,.webp"
            className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
            onChange={internalOnChange}
            disabled={disabled}
          />
        </label>
      </div>
    </Avatar>
  )
}
