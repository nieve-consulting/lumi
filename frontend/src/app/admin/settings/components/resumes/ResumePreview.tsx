"use client"

import { useLayoutEffect, useRef, useState } from "react"
import { contrastRatio, parseHexColor } from "@lumi/shared-contracts/business"
import {
  DEFAULT_RESUME_COLORS,
  fadeContrast,
  footerShowsGradient,
  isResumeLogoUrl,
  MIN_FOOTER_CONTRAST,
  MIN_RESUME_CONTRAST,
  readableTextColor,
} from "@lumi/shared-contracts/resume"

import type { ResumeForm } from "./form"

// The colours the resume would use: each valid colour as entered, even an unreadable one so the admin sees why, and the
// default for an empty or invalid one
function previewColors(form: ResumeForm) {
  const headerColor = parseHexColor(form.headerColor) ?? DEFAULT_RESUME_COLORS.header
  const accentColor = parseHexColor(form.accentColor) ?? DEFAULT_RESUME_COLORS.accent
  const gradientColor = parseHexColor(form.gradientColor)
  return { headerColor, headerTextColor: readableTextColor(headerColor), accentColor, gradientColor }
}

// Lines standing for the resume's text
function TextLines({ widths }: { widths: string[] }) {
  return (
    <div className="space-y-1.5" aria-hidden>
      {widths.map((width, index) => (
        <div key={index} className="h-1.5 rounded-full bg-slate-200" style={{ width }} />
      ))}
    </div>
  )
}

// The PDF's footer text is 24 pixels in a band about 530 pixels wide (cv.tsx), so the sketch's starts at the same share of its
// band and shrinks to fit on one line the same way, showing where long text will be set smaller
const FOOTER_TEXT_SHARE = 24 / 530

function FooterSketchText({ text, style }: { text: string; style: React.CSSProperties }) {
  const ref = useRef<HTMLSpanElement>(null)

  useLayoutEffect(() => {
    const element = ref.current
    const band = element?.parentElement
    if (!element || !band) return
    function fit() {
      if (!element || !band) return
      const room = band.clientWidth - 16
      let size = room * FOOTER_TEXT_SHARE
      element.style.fontSize = `${size}px`
      while (element.getBoundingClientRect().width > room && size > 3) {
        size = Math.max(3, Math.min(size * 0.97, (size * room) / element.getBoundingClientRect().width))
        element.style.fontSize = `${size}px`
      }
    }
    fit()
    const observer = new ResizeObserver(fit)
    observer.observe(band)
    return () => observer.disconnect()
  }, [text])

  return (
    <span ref={ref} className="font-bold whitespace-nowrap" style={style}>
      {text}
    </span>
  )
}

interface IProps {
  form: ResumeForm
  // The business settings' name, which the header shows without a logo
  businessName: string
}

// A sketch of the resume's first page: the header band with the logo or the business name, a section heading with its divider,
// and the footer band with the footer text, left out without one
export default function ResumePreview({ form, businessName }: IProps) {
  const [failedLogo, setFailedLogo] = useState<string>()
  const { headerColor, headerTextColor, accentColor, gradientColor } = previewColors(form)
  const logoUrl = form.logoUrl.trim()
  const footerText = form.footerText.trim()
  // Resumes only load a logo from an https address or the web app
  const logoAccepted = isResumeLogoUrl(logoUrl)
  const showLogo = Boolean(logoUrl) && logoAccepted && failedLogo !== logoUrl
  const invalidColor = [form.headerColor, form.accentColor, form.gradientColor].some((value) => value.trim() && !parseHexColor(value))
  const unreadable =
    contrastRatio(accentColor, "#ffffff") < MIN_RESUME_CONTRAST ||
    (Boolean(footerText) && contrastRatio(accentColor, headerColor) < MIN_FOOTER_CONTRAST) ||
    (gradientColor !== undefined &&
      footerShowsGradient(footerText) &&
      (contrastRatio(gradientColor, headerColor) < MIN_FOOTER_CONTRAST ||
        fadeContrast(footerText, gradientColor, accentColor, headerColor) < MIN_FOOTER_CONTRAST))

  const heading = (text: string) => (
    <p className="border-b pl-1 text-sm font-bold" style={{ color: accentColor, borderBottomColor: accentColor }}>
      {text}
    </p>
  )

  return (
    <figure className="space-y-3 rounded-xl border border-slate-200 bg-slate-50 p-4 lg:sticky lg:top-4">
      <figcaption>
        <p className="text-sm font-semibold">Resume preview</p>
        <p className="text-xs text-slate-600">A sketch of a resume&apos;s first page with these settings, including unsaved changes.</p>
      </figcaption>
      {/* A picture of the settings above, which the fields already say, so screen readers skip it */}
      <div className="overflow-hidden rounded-md border border-slate-200 bg-white shadow-sm" aria-hidden>
        <div className="grid h-10 grid-cols-3">
          <div className="flex min-w-0 items-center justify-center overflow-hidden px-2" style={{ backgroundColor: headerColor }}>
            {showLogo ? (
              // eslint-disable-next-line @next/next/no-img-element -- any address the admin enters, like the PDF's renderer loads it
              <img src={logoUrl} alt="Resume logo" className="h-10 max-w-full object-contain" onError={() => setFailedLogo(logoUrl)} />
            ) : (
              <span className="line-clamp-2 text-center text-xs leading-tight font-bold" style={{ color: headerTextColor }}>
                {businessName || "Your business"}
              </span>
            )}
          </div>
        </div>
        <div className="grid grid-cols-3 gap-3 p-3">
          <div className="space-y-2">
            <div className="mx-auto size-8 rounded-full bg-slate-200" aria-hidden />
            {heading("Contact")}
            <TextLines widths={["80%", "65%"]} />
          </div>
          <div className="col-span-2 space-y-2">
            {heading("Summary")}
            <TextLines widths={["100%", "92%", "96%", "60%"]} />
            {heading("Experience highlights")}
            <TextLines widths={["90%", "75%"]} />
          </div>
        </div>
        <div className="grid h-8 grid-cols-3">
          <div className="flex items-center justify-center text-[9px] text-slate-400" aria-hidden>
            Generated on …
          </div>
          {footerText && (
            <div className="col-span-2 flex min-w-0 items-center justify-center overflow-hidden px-2" style={{ backgroundColor: headerColor }}>
              <FooterSketchText
                text={footerText}
                style={
                  gradientColor
                    ? {
                        backgroundImage: `linear-gradient(90deg, ${gradientColor}, ${accentColor})`,
                        WebkitBackgroundClip: "text",
                        backgroundClip: "text",
                        color: "transparent",
                      }
                    : { color: accentColor }
                }
              />
            </div>
          )}
        </div>
      </div>
      {logoUrl && !showLogo && (
        <p className="text-xs text-slate-600">
          {logoAccepted
            ? "The logo can't be loaded: check its address. Until it loads, resumes show your business name instead."
            : "Resumes show a logo only from an https address or an upload, so they show your business name until then."}
        </p>
      )}
      {invalidColor && <p className="text-xs text-slate-600">The preview uses the default for a colour until it&apos;s a valid hex colour.</p>}
      {unreadable && <p className="text-xs text-slate-600">Some text is hard to read with these colours: the colour fields say which.</p>}
    </figure>
  )
}
