import { NextResponse, type NextRequest } from "next/server"
import { Query, QueryPublicTeamMemberArgs, QueryTeamMemberArgs } from "@/generated/graphql"
import { gql } from "@apollo/client"
import { DEFAULT_SOURCE_LABELS, sourcesInUse } from "@lumi/shared-contracts/knowledge"
import { DEFAULT_LANGUAGE, LANGUAGE_PARAM, matchLanguage, type Language } from "@lumi/shared-contracts/language"

import { clientAddress, createAddressRateLimit } from "@/lib/addressRateLimit"
import { getClient } from "@/lib/apiClient"
import { getAdminAccess } from "@/lib/auth/admin"
import { getBusiness } from "@/lib/business"
import { UNSET_BUSINESS } from "@/lib/businessSettings"
import { getMessages } from "@/lib/i18n"
import { labelsOf } from "@/lib/knowledgeSources"
import { fetchResumeConfig } from "@/lib/resume"
import { serverConfig } from "@/lib/serverConfig"
import { sanitizeFilename } from "@/lib/utils"
import { companyTimeZone } from "@/app/admin/components/dashboard/format"

import TeamMemberCvHtml, { type CvSources, type TeamMemberCv } from "../templates/cv"

interface RequestParams {
  params: Promise<{
    id: string
  }>
}

// The business's settings, or neutral ones before the onboarding wizard has run or while the API can't say
const businessOrUnset = async () => (await getBusiness().catch(() => null)) ?? UNSET_BUSINESS

// The structured sources' labels, which name the resume's English headings, and which are on, so the resume leaves out the
// sections of those that are off. Undefined while the API can't say
async function cvSources(): Promise<CvSources | undefined> {
  try {
    const { data } = await getClient().query<Query>({
      query: gql`
        query ResumeKnowledgeSources {
          knowledgeSources {
            teamMembers
            projects
            clients
            capabilities
            jobOpenings
            labels {
              teamMembers {
                singular
                plural
              }
              projects {
                singular
                plural
              }
              clients {
                singular
                plural
              }
              capabilities {
                singular
                plural
              }
              jobOpenings {
                singular
                plural
              }
            }
          }
        }
      `,
      fetchPolicy: "no-cache",
    })
    const sources = data?.knowledgeSources
    if (sources) {
      const { teamMembers, projects, clients, capabilities, jobOpenings } = sources
      return { labels: labelsOf(sources), shows: sourcesInUse({ teamMembers, projects, clients, capabilities, jobOpenings }) }
    }
  } catch (error) {
    console.error("Loading the knowledge sources for a resume failed", (error as Error).message)
  }
  return undefined
}

// The company's time zone, the appointments host's as on the dashboard, in which the resume's dates and generation date are
// shown. UTC while it can't be read
async function resumeTimeZone() {
  try {
    const { data } = await getClient().query<Query>({
      query: gql`
        query ResumeTimeZone {
          calendar {
            hostTimezone
          }
        }
      `,
      fetchPolicy: "no-cache",
    })
    return companyTimeZone(data?.calendar?.hostTimezone)
  } catch (error) {
    console.error("Loading the time zone for a resume failed", (error as Error).message)
    return companyTimeZone(undefined)
  }
}

// Resumes each address other than an admin's may download per minute. Each one is rendered by a Chromium on the api
// service, which renders two at a time, so a few addresses must not be able to keep every other download waiting
const PUBLIC_RESUMES_PER_MINUTE = 10
const publicResumeLimit = createAddressRateLimit(PUBLIC_RESUMES_PER_MINUTE, 60)

// Admins still get every section while the sources can't be loaded, as the admin shows everything then (showsSource)
const ADMIN_FALLBACK_SOURCES: CvSources = {
  labels: DEFAULT_SOURCE_LABELS,
  shows: { teamMembers: true, projects: true, clients: true, capabilities: true, jobOpenings: true },
}

// The business website, which may link to the resumes, and the local app in development
function allowedOrigins({ websiteUrl }: { websiteUrl?: string }) {
  const origins = websiteUrl ? [new URL(websiteUrl).origin] : []
  if (process.env.NODE_ENV === "development") origins.push("http://localhost:3000")
  return origins
}

const corsOptions = {
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Expose-Headers": "Content-Disposition, Content-Type",
}

export const maxDuration = 30

export async function GET(req: NextRequest, { params }: RequestParams) {
  const origin = req.headers.get("origin") ?? ""
  // Independent reads, together. The resume settings are read now rather than from the cache, so turning resumes off applies
  // to the next download on every server
  const [business, resume, adminAccess, loadedSources] = await Promise.all([
    businessOrUnset(),
    fetchResumeConfig().catch((error: Error) => {
      console.error("Loading the resume settings for a resume failed", error.message)
      return undefined
    }),
    getAdminAccess(),
    cvSources(),
  ])
  const isAllowedOrigin = allowedOrigins(business).includes(origin)

  const { id } = await params
  const searchParams = req.nextUrl.searchParams
  const download = searchParams.has("download")
  // The chat's team member card asks for the chat's language; English without one
  const requestedLanguage = matchLanguage(searchParams.get(LANGUAGE_PARAM)) ?? DEFAULT_LANGUAGE
  const corsHeadeers: Record<string, string> = {}

  if (isAllowedOrigin) {
    corsHeadeers["Access-Control-Allow-Origin"] = origin
  }

  // Nobody gets a resume while the settings can't be read, rather than one an admin may have turned off
  if (!resume) return new Response(null, { headers: { ...corsHeadeers, "Retry-After": "30" }, status: 503 })
  // While resumes are off they don't exist, for admins and everyone else alike
  if (!resume.enabled) return new Response(null, { headers: corsHeadeers, status: 404 })

  // Admins download any team member's resume from the admin interface; everyone else (the chat cards, the business website) only
  // gets the resumes of public team members, with their public projects and clients
  const isAdmin = adminAccess.status === "granted"
  const address = isAdmin ? undefined : clientAddress(req.headers)
  if (address) {
    const limit = publicResumeLimit(address)
    // The resume opens in a tab of its own, so the refusal says why rather than leave it blank
    if (!limit.allowed) {
      return new Response(getMessages(requestedLanguage, business).resume.tooManyDownloads, {
        headers: { ...corsHeadeers, "Content-Type": "text/plain; charset=utf-8", "Retry-After": String(limit.retryAfterSeconds) },
        status: 429,
      })
    }
  }
  // Everyone else gets nothing while the sources can't be loaded, rather than sections of sources that may be off
  if (!loadedSources && !isAdmin) return new Response(null, { headers: { ...corsHeadeers, "Retry-After": "30" }, status: 503 })
  const sources = loadedSources ?? ADMIN_FALLBACK_SOURCES
  // While team members are off, only admins get their resumes
  const teamMember = isAdmin
    ? await getTeamMember(id, requestedLanguage)
    : sources.shows.teamMembers
      ? await getPublicTeamMember(id, requestedLanguage)
      : undefined
  if (teamMember) {
    // The resume's own text (headings, dates, title) is in the requested language, like the chat's interface. Its content falls
    // back to English record by record and field by field where it has no current translation, so it can't name the language
    // of the whole resume
    const filename = sanitizeFilename(getMessages(requestedLanguage, business).resume.title(teamMember.name)) + ".pdf"
    const document = await TeamMemberCvHtml(teamMember, sources, business, resume, requestedLanguage, await resumeTimeZone())
    //return new Response(document, { headers: { "content-type": "text/html" } }) // -> Use this for testing the HTML output

    const pdfResponse = await fetch(`${serverConfig.apiEndpoint}/pdf`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: serverConfig.apiKey },
      body: JSON.stringify({ document, filename }),
    })
    if (!pdfResponse.ok) {
      console.error(`[PDF error]: ${pdfResponse.status} ${await pdfResponse.text()}`)
      return new Response(null, { headers: corsHeadeers, status: 502 })
    }
    return new Response(pdfResponse.body, {
      headers: {
        ...corsHeadeers,
        ...corsOptions,
        "Content-Type": "application/pdf",
        "Content-Disposition": `${download ? "attachment" : "inline"}; filename="${filename}"`,
      },
    })
  }

  return new Response(null, { headers: corsHeadeers, status: 404 })
}

export async function OPTIONS(req: NextRequest) {
  console.log("OPTIONS")
  const origin = req.headers.get("origin") ?? ""
  const isAllowedOrigin = allowedOrigins(await businessOrUnset()).includes(origin)

  const preflightHeaders = {
    ...(isAllowedOrigin && { "Access-Control-Allow-Origin": origin }),
    ...corsOptions,
  }
  return NextResponse.json({}, { headers: preflightHeaders })
}

const mediaUrl = (key: string | null | undefined) => (key ? `${serverConfig.baseUrl}/media/${key}` : null)

async function getTeamMember(id: string, language: Language): Promise<TeamMemberCv | undefined> {
  const client = getClient()

  const { data } = await client.query<Query, QueryTeamMemberArgs>({
    query: gql`
      query ($id: ID!, $language: String) {
        teamMember(id: $id, language: $language, includeUnpublished: true) {
          id
          language
          name
          bio
          webpage
          job_title
          education
          profile_photo_key
          capability_highlights

          experiences {
            company
            location
            position
            start_date
            end_date
            description
            logo_key
          }

          project_contributions(includeUnpublished: true) {
            start_date
            end_date
            description

            project {
              id
              name
              client(includeUnpublished: true) {
                name
                logo_key
              }
            }
          }

          capabilities {
            name
            stars
          }
        }
      }
    `,
    variables: { id, language },
  })

  const teamMember = data?.teamMember
  if (!teamMember) return undefined

  return {
    language: teamMember.language,
    name: teamMember.name,
    job_title: teamMember.job_title,
    bio: teamMember.bio,
    capability_highlights: teamMember.capability_highlights,
    webpage: teamMember.webpage,
    profile_photo_url: mediaUrl(teamMember.profile_photo_key),
    capabilities: (teamMember.capabilities ?? []).flatMap((capability) => (capability ? [{ name: capability.name, stars: capability.stars }] : [])),
    experiences: (teamMember.experiences ?? []).flatMap((experience) =>
      experience ? [{ ...experience, logo_url: mediaUrl(experience.logo_key) }] : []
    ),
    project_contributions: (teamMember.project_contributions ?? []).flatMap((contribution) =>
      contribution
        ? [
            {
              project_name: contribution.project.name,
              client_name: contribution.project.client?.name,
              client_logo_url: mediaUrl(contribution.project.client?.logo_key),
              start_date: contribution.start_date,
              end_date: contribution.end_date,
              description: contribution.description,
            },
          ]
        : []
    ),
  }
}

// Null for team members who are not public; the backend applies the same policy as the chatbot and the MCP server
async function getPublicTeamMember(id: string, language: Language): Promise<TeamMemberCv | undefined> {
  const client = getClient()

  const { data } = await client.query<Query, QueryPublicTeamMemberArgs>({
    query: gql`
      query ($id: ID!, $language: String) {
        publicTeamMember(id: $id, language: $language) {
          id
          language
          name
          bio
          webpage
          job_title
          profile_photo_url
          capability_highlights

          experiences {
            company
            position
            start_date
            end_date
            description
            logo_url
          }

          project_contributions {
            start_date
            end_date
            description

            project {
              name
              client {
                name
                logo_url
              }
            }
          }

          capabilities {
            name
            stars
          }
        }
      }
    `,
    variables: { id, language },
  })

  const teamMember = data?.publicTeamMember
  if (!teamMember) return undefined

  return {
    ...teamMember,
    project_contributions: teamMember.project_contributions.map(({ project, ...contribution }) => ({
      ...contribution,
      project_name: project.name,
      client_name: project.client?.name,
      client_logo_url: project.client?.logo_url,
    })),
  }
}
