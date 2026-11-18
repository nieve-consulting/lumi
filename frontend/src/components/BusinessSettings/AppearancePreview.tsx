"use client"

import { useState } from "react"
import Image from "next/image"
import { DEFAULT_ASSISTANT_NAME, isImageUrl, readablePrimaryColor } from "@lumi/shared-contracts/business"
import { greeting } from "@lumi/shared-contracts/pre-sales"
import { MessageCircle } from "lucide-react"

import { DEFAULT_AVATAR_URL, DEFAULT_PRIMARY_COLOR } from "@/lib/businessSettings"
import { sizedImage } from "@/lib/mediaImage"
import { getMessages } from "@/lib/i18n"

import type { BusinessForm } from "./form"

// An image as the chat shows it: square, or, for the logo, 35 pixels tall at its own width as in the About dialog
function PreviewImage({ source, alt, round = false, logo = false }: { source: string; alt: string; round?: boolean; logo?: boolean }) {
  const [failedSource, setFailedSource] = useState<string>()
  if (!isImageUrl(source) || failedSource === source) {
    return <span className="flex size-12 items-center justify-center rounded-md bg-slate-100 text-xs text-slate-600">No image</span>
  }
  return (
    <Image
      unoptimized
      src={sizedImage(source, logo ? 35 : 48)}
      alt={alt}
      width={logo ? 140 : 48}
      height={logo ? 35 : 48}
      className={logo ? "h-[35px] w-auto max-w-40 object-contain" : `size-12 object-contain ${round ? "rounded-full" : "rounded-md"}`}
      onError={() => setFailedSource(source)}
    />
  )
}

export default function AppearancePreview({ form }: { form: BusinessForm }) {
  const readable = readablePrimaryColor(form.primaryColor)
  const color = readable ?? DEFAULT_PRIMARY_COLOR
  const name = form.assistantName.trim() || DEFAULT_ASSISTANT_NAME
  const messages = getMessages(form.defaultLanguage, { assistantName: name, businessName: form.businessName.trim() })
  const starters =
    form.startersMode === "none"
      ? []
      : form.startersMode === "custom"
        ? form.starters.map((starter) => starter.label[form.defaultLanguage].trim()).filter(Boolean)
        : [messages.starters.discussProject.label, messages.starters.exploreWork.label, messages.starters.findJobs.label]

  return (
    <figure className="space-y-4 rounded-xl border border-slate-200 bg-slate-50 p-4 lg:sticky lg:top-4">
      <figcaption>
        <p className="text-sm font-semibold">Appearance preview</p>
        <p className="text-xs text-slate-600">Illustration of your settings, not a live conversation.</p>
      </figcaption>
      <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
        <div className="flex items-center gap-3 border-b border-slate-100 p-4">
          <PreviewImage source={form.avatarUrl.trim() || DEFAULT_AVATAR_URL} alt="Assistant picture preview" round />
          <div className="min-w-0">
            <p className="truncate font-semibold">{name}</p>
            <p className="truncate text-xs text-slate-600">{form.businessName.trim() || "Your business"}</p>
          </div>
        </div>
        <div className="space-y-4 p-4">
          <p className="rounded-lg bg-slate-100 p-3 text-sm">
            {/* The business's greeting in the default language, or the built-in one while it has none */}
            {greeting(form.defaultLanguage, {
              assistantName: name,
              greeting: form.greeting[form.defaultLanguage].trim() ? form.greeting : undefined,
            })}
          </p>
          <p className="ml-4 rounded-lg p-3 text-sm text-white" style={{ backgroundColor: color }}>
            {form.defaultLanguage === "es" ? "Me gustaría hablar de un proyecto." : "I'd like to discuss a project."}
          </p>
          {starters.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {starters.map((label, i) => (
                <span key={i} className="max-w-full rounded-lg border border-slate-200 px-3 py-2 text-sm break-words">
                  {label}
                </span>
              ))}
            </div>
          )}
        </div>
      </div>
      <div className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2">
          {form.logoUrl.trim() ? (
            // On white, as the About dialog shows it
            <span className="rounded-md bg-white px-2 py-1">
              <PreviewImage source={form.logoUrl.trim()} alt="Business logo preview" logo />
            </span>
          ) : (
            <span className="text-xs text-slate-600">No business logo</span>
          )}
          <span className="text-xs text-slate-600">About dialog</span>
        </div>
        <span
          className="flex size-12 shrink-0 items-center justify-center rounded-full text-white shadow-sm"
          style={{ backgroundColor: color }}
          role="img"
          aria-label="Widget launcher preview"
        >
          <MessageCircle aria-hidden size={24} />
        </span>
      </div>
      {form.primaryColor.trim() && !readable && (
        <p className="text-xs text-slate-600">Preview uses default blue until the colour is valid and readable.</p>
      )}
    </figure>
  )
}
