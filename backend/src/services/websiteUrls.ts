import { checkPublicUrl, SafeFetchError } from "@/utils/safeFetch"
import { minimatch } from "minimatch"

import { invalidInput } from "./errors"

// The URLs of a website the crawler reads (src/tasks/websiteCrawler): its address, its sitemap and its pages. Admins enter the
// address and the sitemap, so both are checked when saved with the same destination rules the crawler fetches with
// (checkPublicUrl in src/utils/safeFetch.ts), and the crawler fetches them through safeFetch, which checks them again together
// with the addresses their host resolves to

// The address as stored: without trailing slashes, so the sitemap and page URLs built from it have a single one
export function normalizeWebsiteUrl(url: string) {
  return url.trim().replace(/\/+$/, "")
}

// The sitemap's URL: an absolute URL as entered, or a path below the website's address, as the crawler always read it
export function sitemapUrlOf(websiteUrl: string, sitemap: string) {
  const trimmed = sitemap.trim()
  if (/^https?:\/\//i.test(trimmed)) return trimmed
  return `${normalizeWebsiteUrl(websiteUrl)}/${trimmed.replace(/^\/+/, "")}`
}

// The URL of one of the website's pages, which the crawler stores by path. The path is absolute, so it replaces any path the
// website's address has
export function pageUrlOf(websiteUrl: string, path: string) {
  try {
    return new URL(path, `${normalizeWebsiteUrl(websiteUrl)}/`).toString()
  } catch {
    return ""
  }
}

// A host as the site it belongs to: lowercase and without www
export function siteHost(host: string) {
  return host.toLowerCase().replace(/^www\./, "")
}

// Whether two hosts are the same site, with or without www, as a website's sitemap often lists its pages on the other one
export function sameSite(host: string, other: string) {
  return siteHost(host) === siteHost(other)
}

// Whether a page is on one of the given sites, by host as sameSite compares them. Sites that aren't valid URLs match nothing
export function isPageOnSites(pageUrl: string, siteUrls: (string | null | undefined)[]) {
  const hostOf = (url: string | null | undefined) => {
    try {
      return url ? new URL(url).host : undefined
    } catch {
      return undefined
    }
  }
  const host = hostOf(pageUrl)
  return (
    !!host &&
    siteUrls.some((site) => {
      const siteHost = hostOf(site)
      return !!siteHost && sameSite(host, siteHost)
    })
  )
}

// Whether a page path is one the website's crawl leaves out, by the admin's exclude paths (minimatch patterns)
export function isExcludedPath(pathname: string, excludePaths: (string | null)[] | null | undefined) {
  return excludePaths?.some((excludePath) => !!excludePath && minimatch(pathname, excludePath)) ?? false
}

// Checks the address and the sitemap an admin entered before saving them. Throws an invalid_input ServiceError written for the
// admin, which the resolvers answer as BAD_USER_INPUT
export function checkWebsiteUrls({ url, sitemap }: { url: string; sitemap: string }) {
  const check = (label: string, field: string, value: string) => {
    try {
      checkPublicUrl(value)
    } catch (error) {
      if (!(error instanceof SafeFetchError)) throw error
      throw invalidInput(`The ${label} can't be crawled: ${error.message} Enter a public http or https address.`, { field })
    }
  }

  check("website URL", "url", normalizeWebsiteUrl(url))
  if (!sitemap.trim()) throw invalidInput("Enter the sitemap, such as sitemap.xml.", { field: "sitemap" })
  check("sitemap URL", "sitemap", sitemapUrlOf(url, sitemap))
}
