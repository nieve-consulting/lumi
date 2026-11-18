import { load as cheerioLoad, type CheerioAPI } from "cheerio"
import TurndownService from "turndown"

// A web page's readable text as Markdown, shared by the website crawler, read_current_page and project drafts. The page is
// cleaned with cheerio and only converted by turndown, so every rule applies to the one tree that is converted (turndown parses
// <noscript> differently from cheerio, and its image rule runs before its remove() filters)

// Page furniture and markup that carries no text a visitor reads: menus, forms, embeds, script fallbacks and pop-ups such as
// cookie banners
const NOT_CONTENT = "script, style, template, noscript, iframe, header, footer, nav, form, dialog, [role='dialog'], [aria-modal='true']"

// Elements that make a link wrap a block, such as a card, rather than a phrase
const BLOCKS = "address, article, blockquote, div, dl, figure, h1, h2, h3, h4, h5, h6, hr, li, ol, p, pre, section, table, ul"

// A share of the page's text above which an element is taken to be the page's content rather than a part of it
const CONTENT_SHARE = 0.5

const turndownService = new TurndownService()
// A link around a block (a listing's card) can't be written as one Markdown link, so the card's text comes first and the link
// after it, named by the card's heading
turndownService.addRule("blockLink", {
  filter: (node) => node.nodeName === "A" && !!node.getAttribute("href") && !!node.querySelector(BLOCKS),
  replacement: (content, node) => {
    const element = node as HTMLElement
    const href = element.getAttribute("href")!.replace(/([()])/g, "\\$1")
    const name = element.querySelector("h1, h2, h3, h4, h5, h6")?.textContent?.replace(/\s+/g, " ").trim() || "Link"
    return `\n\n${content.trim()}\n\n[${turndownService.escape(name)}](${href})\n\n`
  },
})

const textLength = (selection: { text(): string }) => selection.text().replace(/\s+/g, " ").trim().length

// Images become their alt text, which can name a client or a logo, without their addresses (long /_next/image?url=...
// links on a Next.js site). Decorative icons go, and a link with no text left (a logo without alt text) is dropped rather
// than written as an empty [](/x), unless its aria-label names it
function clean(page$: CheerioAPI) {
  page$(NOT_CONTENT).remove()
  page$("svg[aria-hidden='true']").remove()
  page$("img").each((_, img) => {
    const alt = page$(img).attr("alt")?.trim()
    // A logo beside its own name (a client list, a card) would only repeat it
    const around = page$(img).parent().add(page$(img).closest("a, li, figure")).text().toLowerCase()
    if (alt && !around.includes(alt.toLowerCase())) page$(img).replaceWith(page$("<span>").text(` ${alt} `))
    else page$(img).remove()
  })
  page$("a").each((_, link) => {
    if (page$(link).text().trim()) return
    const label = page$(link).attr("aria-label")?.trim()
    if (label) page$(link).text(label)
    else page$(link).remove()
  })
}

// The page's content: its main <article> when one holds most of the page's text, else its <main> when that does, else its
// <body>. Several articles are usually a listing's cards, and an article beside them (a post's related posts) is a small part
// of the page, so neither is mistaken for it
function content(page$: CheerioAPI) {
  const body = page$("body")
  const total = textLength(body)
  const articles = page$("article")
    .not("article article")
    .toArray()
    .map((article) => ({ article, length: textLength(page$(article)) }))
  const largest = articles.reduce<(typeof articles)[number] | undefined>((max, a) => (!max || a.length > max.length ? a : max), undefined)
  if (largest && largest.length > total * CONTENT_SHARE) return page$(largest.article).html() ?? ""
  const main = page$("main").first()
  if (main.length && textLength(main) > total * CONTENT_SHARE) return main.html() ?? ""
  return body.html() ?? ""
}

export function readHtmlPage(html: string): { title: string | undefined; ogTitle: string | undefined; markdown: string } {
  const page$ = cheerioLoad(html)
  // Read before cleaning: the <title> of an inline <svg> must not stand in for a page without one
  const title = page$("head title").first().text().trim() || page$("title").not("svg title").first().text().trim() || undefined
  const ogTitle = page$("meta[property='og:title']").attr("content")?.trim() || undefined
  clean(page$)
  return { title, ogTitle, markdown: turndownService.turndown(content(page$)).trim() }
}
