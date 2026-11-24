import { CircleArrowUp } from "lucide-react"

import { getLumiVersion } from "./getLumiVersion"

const UPGRADE_DOCS_URL = "https://docs.lumi.nieve.ai/self-hosting/operations#upgrades"

// As tall as the version line, so the links above it stay put: the Suspense fallback while it loads, and what shows when it fails
export function LumiVersionPlaceholder() {
  return <div aria-hidden className="h-4" />
}

// "Lumi 0.62.0" for a release, and an honest name for builds without a release version
function versionLabel(current: string) {
  if (current === "local") return "Lumi development build"
  if (current === "unknown") return "Lumi version unknown"
  return `Lumi ${current}`
}

interface ExternalLinkProps {
  href: string
  children: React.ReactNode
  // Read before the visible text, so the link makes sense out of context, e.g. in a screen reader's list of links
  context?: string
}

function ExternalLink({ href, children, context }: ExternalLinkProps) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="focus-visible:ring-ring inline-block rounded-sm py-1 font-medium text-blue-700 underline outline-hidden hover:text-blue-800 focus-visible:ring-2"
    >
      {context && <span className="sr-only">{context} </span>}
      {children}
      <span className="sr-only"> (opens in a new tab)</span>
    </a>
  )
}

// The version this installation runs at the foot of the admin navigation and, when a newer release exists, a quiet pointer
// to its notes and the upgrade guide. Shows only the placeholder when the version couldn't be loaded, and only the version
// when the release check is off or GitHub couldn't be reached. Render it inside a Suspense boundary with LumiVersionPlaceholder
// as the fallback, so the navigation never waits
export default async function LumiVersionInfo() {
  const version = await getLumiVersion()
  if (!version) return <LumiVersionPlaceholder />

  // updateAvailable is only true for a release version, so current is a version number below
  const latest = version.updateAvailable ? version.latest : undefined
  if (!latest) return <p className="px-3 text-xs text-slate-500">{versionLabel(version.current)}</p>

  // The release page comes from GitHub through the backend; only link to it as a web page
  const notesUrl = latest.url.startsWith("https://") ? latest.url : undefined

  return (
    <div className="rounded-md border border-slate-200 bg-slate-50 p-3 text-xs text-slate-600">
      <p className="flex items-center gap-1.5 font-medium text-slate-900">
        <CircleArrowUp aria-hidden className="size-4 shrink-0 text-blue-600" />
        Lumi {latest.version} is available
      </p>
      {/* Admins are often business staff, not whoever runs the server */}
      <p className="mt-1">This installation runs {version.current}. Let whoever operates it know.</p>
      <p className="mt-0.5 flex flex-wrap gap-x-3">
        {notesUrl && (
          <ExternalLink href={notesUrl} context={`Lumi ${latest.version}`}>
            Release notes
          </ExternalLink>
        )}
        <ExternalLink href={UPGRADE_DOCS_URL}>Upgrade guide</ExternalLink>
      </p>
    </div>
  )
}
