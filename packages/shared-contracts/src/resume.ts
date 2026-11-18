import { z } from "zod"

import { contrastRatio, luminance, parseHexColor, SITE_PATH } from "./business"
import { DEFAULT_LANGUAGE, LANGUAGE_PARAM, type Language } from "./language"

// Team member resumes: whether the installation offers them, and the logo, colours and footer text of the PDF. Admins set them in
// Settings → Resumes; the backend stores them as a single record. Until it is saved, resumes are on with DEFAULT_RESUME_COLORS,
// no logo and no footer text.
// Everything here is public: the web app renders it into the PDF.
//
// While resumes are off, nothing offers or serves them: the chat's team member cards and the admin's team member actions don't
// link them, the MCP server and the agents don't mention or return a resume URL, and the resume route answers not found

// Path of a team member's PDF resume on the web app, in the language. The route serves English when the path names none, so
// English resumes keep one URL
export function teamMemberResumePath(id: string, language: Language = DEFAULT_LANGUAGE) {
  const query = language === DEFAULT_LANGUAGE ? "" : `?${new URLSearchParams({ [LANGUAGE_PARAM]: language })}`
  return `/api/pdf/team-member/${id}${query}`
}

// Neutral colours that suit any business: a light header and footer band with a dark slate accent
export const DEFAULT_RESUME_COLORS = { header: "#f1f5f9", accent: "#334155" } as const

// Headings are large bold text (24px), which needs WCAG's 3:1 contrast
export const MIN_RESUME_CONTRAST = 3

// The footer text starts as large text too, but long text is set smaller to fit its band on one line, below the 14pt (about
// 18.7px) that bold text needs to count as large, so its colours need the 4.5:1 of normal text
export const MIN_FOOTER_CONTRAST = 4.5

export const FOOTER_TEXT_MAX_LENGTH = 60

const WHITE = "#ffffff"
const BLACK = "#000000"

// The settings as admins send them and the backend stores them. Unset fields take null or undefined; an empty text counts as
// unset
export type ResumeSettingsInput = {
  // Whether Lumi offers resumes at all
  enabled: boolean
  // The logo in the header band, an absolute http(s) URL or a path on the web app such as /media/… Unset shows the business name
  logoUrl?: string | null
  // The background of the header and footer bands, #rgb or #rrggbb. Unset uses DEFAULT_RESUME_COLORS.header
  headerColor?: string | null
  // Section headings, their dividers and the footer text, #rgb or #rrggbb. Unset uses DEFAULT_RESUME_COLORS.accent
  accentColor?: string | null
  // A second colour the footer text fades from into the accent colour. Unset shows the footer text in the accent colour
  gradientColor?: string | null
  // The text in the footer band, e.g. the website's address, linked to the business website when it has one. Unset leaves the
  // footer band out
  footerText?: string | null
}

// The resume as the web app renders it, with the defaults filled in and every colour lowercase #rrggbb
export type ResumeConfig = {
  enabled: boolean
  logoUrl?: string
  headerColor: string
  // Black or white, whichever reads better on the header colour: the business name shown when there is no logo
  headerTextColor: string
  accentColor: string
  gradientColor?: string
  footerText?: string
}

// The settings until an admin saves them
export const DEFAULT_RESUME_SETTINGS: ResumeSettingsInput = { enabled: true }

// A problem with a setting, by its field ("accentColor"), so a form can show it next to the field
export type ResumeSettingsProblem = { field: string; message: string }

// Lists every problem, so the admin fixes them all at once
export class ResumeSettingsError extends Error {
  constructor(readonly problems: ResumeSettingsProblem[]) {
    super(`Invalid resume settings:\n${problems.map(({ field, message }) => `- ${field}: ${message}`).join("\n")}`)
    this.name = "ResumeSettingsError"
  }
}

// Trims text; an empty or null value counts as unset
const unset = (value: unknown) => (value === null ? undefined : typeof value === "string" ? value.trim() || undefined : value)

const optional = <T extends z.ZodType>(schema: T) => z.preprocess(unset, schema.optional())

const color = z.string().transform((value, context) => {
  const hex = parseHexColor(value)
  if (!hex) {
    context.addIssue({ code: "custom", message: "Enter a hex colour such as #1d4ed8" })
    return z.NEVER
  }
  return hex
})

// The resume logo: an https address, as the PDF renderer loads images only over https, or a path on the web app such as an upload
const resumeLogoUrl = z.union([z.url({ protocol: /^https$/ }), z.string().regex(SITE_PATH)], {
  error: "Enter an image address starting with https://, or a path on this site starting with /. Resumes can't load images over http",
})

// Whether an address is one the resume logo accepts, e.g. for the settings preview while it's being typed
export const isResumeLogoUrl = (value: string) => resumeLogoUrl.safeParse(value).success

const settingsSchema = z.object({
  enabled: z.boolean({ error: "Choose whether Lumi offers resumes" }),
  logoUrl: optional(resumeLogoUrl),
  headerColor: optional(color),
  accentColor: optional(color),
  gradientColor: optional(color),
  footerText: optional(z.string().max(FOOTER_TEXT_MAX_LENGTH, `Too long: at most ${FOOTER_TEXT_MAX_LENGTH} characters`)),
})

// Text that reads on a background: black or white, whichever contrasts more
export const readableTextColor = (background: string) => (contrastRatio(background, BLACK) >= contrastRatio(background, WHITE) ? BLACK : WHITE)

// Rounded down, so a contrast just under a minimum never reads as meeting it, e.g. 4.48 as 4.4:1 rather than 4.5:1
const ratio = (value: number) => `${(Math.floor(value * 10) / 10).toFixed(1)}:1`

// The #rrggbb colour a fraction of the way from one #rrggbb colour to another: the footer text's fade gives each character one
export function mixColors(from: string, to: string, fraction: number) {
  const channel = (hex: string, start: number) => parseInt(hex.slice(start, start + 2), 16)
  return `#${[1, 3, 5]
    .map((start) => Math.round(channel(from, start) + (channel(to, start) - channel(from, start)) * fraction))
    .map((value) => value.toString(16).padStart(2, "0"))
    .join("")}`
}

// The footer text's characters as people see them, so an accent, a flag or an emoji sequence is one character in one colour
export const footerCharacters = (text: string) =>
  Array.from(new Intl.Segmenter(undefined, { granularity: "grapheme" }).segment(text), ({ segment }) => segment)

// Each character of the footer text with the solid colour the resume draws it in: the accent colour, or with a gradient colour,
// a step of the fade from it into the accent colour. A single character is in the accent colour
export function footerCharacterColors(text: string, accentColor: string, gradientColor?: string) {
  const characters = footerCharacters(text)
  return characters.map((character, index) => ({
    character,
    color: gradientColor && characters.length > 1 ? mixColors(gradientColor, accentColor, index / (characters.length - 1)) : accentColor,
  }))
}

// The lowest contrast on the band colour of the colours the footer text fades through between its two ends, which can pass
// the band colour when one end is lighter than it and the other darker, e.g. white into black on grey. Only the colours the
// text's characters are drawn in count, so a footer of one or two characters has none in between (Infinity)
export function fadeContrast(text: string, gradientColor: string, accentColor: string, headerColor: string) {
  const between = footerCharacterColors(text, accentColor, gradientColor).slice(1, -1)
  return Math.min(Infinity, ...between.map(({ color }) => contrastRatio(color, headerColor)))
}

// Whether the footer text draws a character in the gradient colour itself: only with two characters or more
export const footerShowsGradient = (text: string) => footerCharacters(text).length > 1

// What to pick instead of a gradient colour whose fade passes the band colour: one on the accent colour's side of it
export const fadeAdvice = (accentColor: string, headerColor: string) =>
  `pick a gradient colour that is ${luminance(accentColor) > luminance(headerColor) ? "lighter" : "darker"} than the band colour, like the accent colour`

// Each setting that is valid on its own, for the checks across settings to run while another one isn't
function validFields(settings: unknown): Partial<z.output<typeof settingsSchema>> {
  const values = typeof settings === "object" && settings !== null ? (settings as Record<string, unknown>) : {}
  return Object.fromEntries(
    Object.entries(settingsSchema.shape).flatMap(([key, schema]) => {
      const parsed = schema.safeParse(values[key])
      return parsed.success ? [[key, parsed.data]] : []
    })
  )
}

// Checks settings and fills in the defaults. Colours must keep the resume readable: the accent on the white page at
// MIN_RESUME_CONTRAST and, with footer text, every colour its characters are drawn in on the header colour behind them at
// MIN_FOOTER_CONTRAST. Checked even while resumes are off, so turning them on never brings back an unreadable resume. Throws a
// ResumeSettingsError listing every problem by field
export function parseResumeSettings(input: unknown): ResumeConfig {
  const settings = input ?? DEFAULT_RESUME_SETTINGS
  const result = settingsSchema.safeParse(settings)
  const problems: ResumeSettingsProblem[] = result.success
    ? []
    : result.error.issues.map((issue) => ({ field: issue.path.map(String).join("."), message: issue.message }))
  // The contrast checks still run on the fields that are valid on their own, so a bad logo address doesn't hide a colour problem
  // until the next save
  const data = result.success ? result.data : validFields(settings)
  const { logoUrl, gradientColor, footerText } = data
  const headerColor = data.headerColor ?? DEFAULT_RESUME_COLORS.header
  const accentColor = data.accentColor ?? DEFAULT_RESUME_COLORS.accent
  // A colour that isn't one yet is left out of the checks, rather than checked as its default
  const invalid = new Set(problems.map(({ field }) => field))
  const colorsChecked = !invalid.has("headerColor") && !invalid.has("accentColor")

  const onPage = contrastRatio(accentColor, WHITE)
  if (!invalid.has("accentColor") && onPage < MIN_RESUME_CONTRAST) {
    problems.push({
      field: "accentColor",
      message: `${accentColor} is too light for headings on the white page (contrast ${ratio(onPage)}, needs at least ${MIN_RESUME_CONTRAST}:1): pick a darker colour`,
    })
  }
  // The footer text is the only text in these colours on the header colour
  const onHeader = contrastRatio(accentColor, headerColor)
  if (colorsChecked && footerText && onHeader < MIN_FOOTER_CONTRAST) {
    problems.push({
      field: "accentColor",
      message: `${accentColor} is too close to the band colour ${headerColor} for the footer text (contrast ${ratio(onHeader)}, needs at least ${MIN_FOOTER_CONTRAST}:1)`,
    })
  }
  // A one-character footer is drawn in the accent colour alone, so its gradient colour has nothing to check
  if (colorsChecked && footerText && gradientColor && footerShowsGradient(footerText)) {
    const gradientOnHeader = contrastRatio(gradientColor, headerColor)
    if (gradientOnHeader < MIN_FOOTER_CONTRAST) {
      problems.push({
        field: "gradientColor",
        message: `${gradientColor} is too close to the band colour ${headerColor} for the footer text (contrast ${ratio(gradientOnHeader)}, needs at least ${MIN_FOOTER_CONTRAST}:1)`,
      })
    } else if (onHeader >= MIN_FOOTER_CONTRAST) {
      const faded = fadeContrast(footerText, gradientColor, accentColor, headerColor)
      if (faded < MIN_FOOTER_CONTRAST) {
        problems.push({
          field: "gradientColor",
          message: `The footer text fades from ${gradientColor} into ${accentColor} through colours too close to the band colour ${headerColor} (contrast ${ratio(faded)}, needs at least ${MIN_FOOTER_CONTRAST}:1): ${fadeAdvice(accentColor, headerColor)}`,
        })
      }
    }
  }
  // Problems with single fields make the parse fail with them; the rest are the checks across settings
  if (!result.success || problems.length) throw new ResumeSettingsError(problems)

  return {
    enabled: result.data.enabled,
    ...(logoUrl && { logoUrl }),
    headerColor,
    headerTextColor: readableTextColor(headerColor),
    accentColor,
    ...(gradientColor && { gradientColor }),
    ...(footerText && { footerText }),
  }
}
