import "server-only"

/* eslint-disable jsx-a11y/alt-text */
/* eslint-disable @next/next/no-img-element */
/* eslint-disable @next/next/no-sync-scripts */
import { telHref, type PublicBusinessConfig } from "@lumi/shared-contracts/business"
import type { SourceLabels, StructuredSources } from "@lumi/shared-contracts/knowledge"
import type { Language } from "@lumi/shared-contracts/language"
import { footerCharacterColors, type ResumeConfig } from "@lumi/shared-contracts/resume"
import { BookPlus, Building2, Mail, Phone } from "lucide"
import { DateTime } from "luxon"

import { absoluteImageUrl } from "@/lib/business"
import { getMessages } from "@/lib/i18n"
import { serverConfig } from "@/lib/serverConfig"

import LucideIcon from "./LucideIcon"
import Markdown from "./markdown"

// const baseUrl = "https://<your deployed Lumi app>" // -> This is for local development
const baseUrl = serverConfig.baseUrl // -> Use this for production

// What the resume shows, with absolute image URLs: the admin profile or the public profile of a team member
export interface TeamMemberCv {
  // The language the content was returned in
  language?: string | null
  name: string
  job_title: string
  bio?: string | null
  capability_highlights?: string | null
  webpage?: string | null
  profile_photo_url?: string | null
  capabilities: { name: string; stars: number }[]
  experiences: {
    company: string
    position: string
    start_date: string
    end_date?: string | null
    description?: string | null
    logo_url?: string | null
  }[]
  project_contributions: {
    project_name: string
    client_name?: string | null
    client_logo_url?: string | null
    start_date: string
    end_date?: string | null
    description?: string | null
  }[]
}

// The installation's structured sources: their labels, which name the English headings, and which are on. The sections of
// sources that are off are left out
export interface CvSources {
  labels: SourceLabels
  shows: StructuredSources
}

interface IProps {
  teamMember: TeamMemberCv
  sources: CvSources
  // The business whose resume it is: its name, website and public contact details
  business: PublicBusinessConfig
  // The resume's logo and colours (Settings → Resumes)
  resume: ResumeConfig
  // The language the resume was requested in, which its own text (headings, dates) follows
  language: Language
  timezone: string
}

// A section heading with its divider, in the accent colour
function Heading({ accentColor, className = "mb-4", children }: { accentColor: string; className?: string; children: React.ReactNode }) {
  return (
    <div className={`${className} w-full border-b pl-2 text-2xl font-bold`} style={{ color: accentColor, borderBottomColor: accentColor }}>
      {children}
    </div>
  )
}

// Text for an HTML attribute written by hand
const escapeAttribute = (value: string) => value.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;")

// The header's logo at the band's full height, or the business name in the colour that reads on the band. The renderer loads
// the logo under its own rules (https from a public host, or the web app), so a logo it can't load, e.g. because its upload or
// its website is gone or it's served over http, swaps itself for the name as it fails rather than printing a broken image.
// React renders no event handlers to HTML, so the image is written by hand with an onerror attribute, there before it can fail
function HeaderLogo({ logoUrl, name, color }: { logoUrl?: string; name: string; color: string }) {
  const nameClassName = "line-clamp-2 text-center text-xl leading-tight font-bold"
  if (!logoUrl) {
    return (
      <span className={nameClassName} style={{ color }}>
        {name}
      </span>
    )
  }
  const image = `<img src="${escapeAttribute(logoUrl)}" alt="${escapeAttribute(name)}" class="h-[65px] max-w-full object-contain" onerror="this.parentElement.nextElementSibling.style.display='';this.parentElement.remove()">`
  return (
    <>
      <span className="contents" dangerouslySetInnerHTML={{ __html: image }} />
      <span className={nameClassName} style={{ color, display: "none" }}>
        {name}
      </span>
    </>
  )
}

// The footer text's size, which long text shrinks from to fit the band on one line (FOOTER_FIT_SCRIPT)
const FOOTER_FONT_SIZE = 24

// Shrinks long footer text to fit its band on one line, as wrapping would run past the band's 45 pixels: the size scales with
// the room left, so the text keeps its font and just gets smaller. Runs once the page and Tailwind's styles have loaded, before
// the renderer prints it; the band clips the text if scripts don't run. The settings preview fits its sketch the same way
const FOOTER_FIT_SCRIPT = `window.addEventListener("load", function () {
  requestAnimationFrame(function () {
    var text = document.getElementById("resume-footer-text")
    if (!text) return
    var room = text.parentElement.clientWidth - 16
    var size = ${FOOTER_FONT_SIZE}
    // Scaled to the room, then a little more while hinting at the smaller size still leaves it too wide
    while (text.getBoundingClientRect().width > room && size > 8) {
      size = Math.max(8, Math.min(size * 0.97, (size * room) / text.getBoundingClientRect().width))
      text.style.fontSize = size + "px"
    }
  })
})`

// The footer text: in the accent colour, or fading left to right from the gradient colour into it, as Nieve's resumes drew their
// cyan to magenta website address, and linked to the business website when it has one. The fade gives each character a solid
// colour of its own, the only way PDF viewers all draw it: Chrome's doesn't draw SVG text filled with a gradient, and macOS's
// Preview draws text clipped to a gradient background (background-clip: text) as a flat colour with a block over its end
function FooterText({ text, websiteUrl, resume: { accentColor, gradientColor } }: { text: string; websiteUrl?: string; resume: ResumeConfig }) {
  // Coloured as the settings checked them (footerCharacterColors), character by character
  const content = gradientColor
    ? footerCharacterColors(text, accentColor, gradientColor).map(({ character, color }, index) => (
        <span key={index} style={{ color }}>
          {character}
        </span>
      ))
    : text
  return websiteUrl ? (
    <a href={websiteUrl} style={{ color: accentColor }}>
      {content}
    </a>
  ) : (
    <span style={{ color: accentColor }}>{content}</span>
  )
}

function CvTemplate({ teamMember, sources: { labels, shows }, business, resume, language, timezone }: IProps) {
  const t = getMessages(language, business).resume
  const topCapabilities = shows.capabilities ? teamMember.capabilities.filter((capability) => capability.stars > 3) : []
  // The renderer loads images by absolute URL, so a logo on the Lumi web app gets the app's address
  const logoUrl = resume.logoUrl && absoluteImageUrl(resume.logoUrl, baseUrl)
  const { accentColor } = resume
  // Month names follow the resume's language
  const formatDate = (date: DateTime, format: string) => date.setZone(timezone).toFormat(format, { locale: language })
  const formatIso = (iso: string, format: string) => formatDate(DateTime.fromISO(iso, { zone: timezone }), format)

  return (
    <>
      <title>{t.title(teamMember.name)}</title>
      <script src="https://cdn.tailwindcss.com"></script>
      <style>
        {`
        @page wide {
          size: a4 portrait;
        }

        .header, .header-space {
          height: 85px;
        }
        
        .footer, .footer-space {
          height: 45px;
        }

        .header {
          position: fixed;
          top: 0;
          left: 0;
          right: 0;
        }

        .footer {
          position: fixed;
          bottom: 0;
          right: -1px;
          left: 0;
        }

        @media print {
          .pagebreak { page-break-before: always; }
        }
      `}
      </style>
      <div className="header pb-4">
        <div className="grid h-[65px] w-full grid-cols-3">
          <div className="flex min-w-0 items-center justify-center overflow-hidden px-3" style={{ backgroundColor: resume.headerColor }}>
            <HeaderLogo logoUrl={logoUrl} name={business.businessName} color={resume.headerTextColor} />
          </div>
        </div>
      </div>
      <table>
        <thead>
          <tr>
            <td>
              <div className="header-space" />
            </td>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>
              <div className="mx-6">
                <div className="grid grid-cols-3 gap-6">
                  <div>
                    {teamMember.profile_photo_url && (
                      <img className="mx-auto mb-4 aspect-square w-[70%] rounded-full object-cover" src={teamMember.profile_photo_url} />
                    )}
                    <div className="mb-4 text-center">
                      <div className="text-2xl font-bold">{teamMember.name}</div>
                      <div className="text-slate-500">{teamMember.job_title}</div>
                    </div>
                    {(business.contactPhone || business.contactEmail) && (
                      <>
                        <Heading accentColor={accentColor}>{t.contact}</Heading>
                        <div className="mb-4 text-sm">
                          {business.contactPhone && (
                            <div className="mb-2">
                              <LucideIcon icon={Phone} size={18} className="mr-2 inline" />
                              <a href={telHref(business.contactPhone)}>{business.contactPhone}</a>
                            </div>
                          )}
                          {business.contactEmail && (
                            <div>
                              <LucideIcon icon={Mail} size={18} className="mr-2 inline" />{" "}
                              <a href={`mailto:${business.contactEmail}`}>{business.contactEmail}</a>
                            </div>
                          )}
                        </div>
                      </>
                    )}
                    {topCapabilities.length > 0 && (
                      <>
                        <Heading accentColor={accentColor}>{t.capabilities(labels)}</Heading>
                        {topCapabilities.map((capability) => capability.name).join(" - ")}
                      </>
                    )}
                    <Heading accentColor={accentColor} className="mt-4 mb-4">
                      {t.languages}
                    </Heading>
                    <ul>
                      <li>{t.english}</li>
                      <li>{t.spanish}</li>
                    </ul>
                  </div>
                  <div className="col-span-2">
                    <Heading accentColor={accentColor} className="-mt-4 mb-4">
                      {t.summary}
                    </Heading>
                    <Markdown>{teamMember.bio || ""}</Markdown>
                    {teamMember.capability_highlights && (
                      <>
                        <Heading accentColor={accentColor} className="my-4">
                          {t.capabilityHighlights(labels, shows.capabilities)}
                        </Heading>
                        <Markdown>{teamMember.capability_highlights}</Markdown>
                      </>
                    )}
                    <Heading accentColor={accentColor} className="my-4">
                      {t.experienceHighlights}
                    </Heading>
                    {teamMember.experiences.slice(0, 3).map((experience, idx) => (
                      <div className="mb-4 flex" key={idx}>
                        {experience.logo_url ? (
                          <img className="mr-2 h-10 w-10" src={experience.logo_url} />
                        ) : (
                          <div className="mr-2 h-10 w-10 shrink-0" />
                        )}
                        <div>
                          <div className="font-bold">{experience.company}</div>
                          <div>
                            {experience.position}{" "}
                            <span className="text-sm text-gray-500">
                              {experience.start_date && formatIso(experience.start_date, "yyyy")}
                              {" - "}
                              {experience.end_date ? formatIso(experience.end_date, "yyyy") : t.present}
                            </span>
                          </div>
                          <div className="mt-2 text-sm">
                            <Markdown>{experience.description || ""}</Markdown>
                          </div>
                        </div>
                      </div>
                    ))}
                    {teamMember.webpage && (
                      <div className="text-sm">
                        <LucideIcon icon={BookPlus} size={18} className="mr-2 inline-block" />
                        <a href={teamMember.webpage} className="text-xs text-blue-500">
                          {teamMember.webpage}
                        </a>
                      </div>
                    )}
                  </div>
                </div>
                {shows.projects && teamMember.project_contributions.length > 0 && (
                  <>
                    <div className="pagebreak" />
                    <Heading accentColor={accentColor}>{t.projectContributions(labels)}</Heading>
                    {teamMember.project_contributions.map((projectContribution, idx) => (
                      <div key={idx} className="mb-4">
                        <div className="flex gap-4">
                          <div className="content-center">
                            {shows.clients && projectContribution.client_logo_url ? (
                              <img className="h-10 w-10 content-center" src={projectContribution.client_logo_url} />
                            ) : (
                              <LucideIcon icon={Building2} size={40} className="text-slate-400" />
                            )}
                          </div>
                          <div>
                            {shows.clients ? (
                              <>
                                <div className="text-lg font-bold">{projectContribution.client_name || t.undisclosedClient(labels)}</div>
                                <div className="text-sm">{projectContribution.project_name}</div>
                              </>
                            ) : (
                              <div className="text-lg font-bold">{projectContribution.project_name}</div>
                            )}
                            <div className="text-xs text-gray-500">
                              {projectContribution.start_date && formatIso(projectContribution.start_date, t.monthFormat)}
                              {" - "}
                              {projectContribution.end_date ? formatIso(projectContribution.end_date, t.monthFormat) : t.active}
                            </div>
                          </div>
                        </div>
                        <div className="mt-2 ml-14 text-sm">
                          <Markdown>{projectContribution.description || ""}</Markdown>
                        </div>
                      </div>
                    ))}
                  </>
                )}
              </div>
            </td>
          </tr>
        </tbody>
        <tfoot>
          <tr>
            <td>
              <div className="footer-space" />
            </td>
          </tr>
        </tfoot>
      </table>
      <div className="footer">
        <div className="grid h-full w-full grid-cols-3">
          <div className="content-center text-center text-xs text-slate-400">{t.generatedOn(formatDate(DateTime.now(), t.generatedOnFormat))}</div>
          {/* Without footer text the footer band is left out */}
          {resume.footerText && (
            <div
              className="col-span-2 flex min-w-0 items-center justify-center overflow-hidden px-2 font-bold whitespace-nowrap"
              style={{ backgroundColor: resume.headerColor }}
            >
              <span id="resume-footer-text" style={{ fontSize: FOOTER_FONT_SIZE, lineHeight: 1.2 }}>
                <FooterText text={resume.footerText} websiteUrl={business.websiteUrl} resume={resume} />
              </span>
            </div>
          )}
        </div>
      </div>
      {resume.footerText && <script dangerouslySetInnerHTML={{ __html: FOOTER_FIT_SCRIPT }} />}
    </>
  )
}

export default async function TeamMemberCvHtml(
  teamMember: TeamMemberCv,
  sources: CvSources,
  business: PublicBusinessConfig,
  resume: ResumeConfig,
  language: Language,
  timezone: string = "UTC"
) {
  const ReactDOMServer = await import("react-dom/server")
  return ReactDOMServer.renderToString(
    <CvTemplate teamMember={teamMember} sources={sources} business={business} resume={resume} language={language} timezone={timezone} />
  )
}
