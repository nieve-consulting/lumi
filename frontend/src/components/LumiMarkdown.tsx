"use client"

import clsx from "clsx"
import { ExternalLink } from "lucide-react"
import { defaultComponents, Streamdown, type Components } from "streamdown"

import { useI18n } from "@/lib/i18n/LanguageProvider"

// Opens in a new tab, which screen readers hear in the chat's language (English outside the chat)
function NewTabLink({ children, ...props }: React.ComponentProps<"a">) {
  const { t } = useI18n()
  return (
    <a {...props} target="_blank" rel="noreferrer">
      {children}
      <ExternalLink className="ml-1 inline" size={15} />
      <span className="sr-only"> {t.common.opensInNewTab}</span>
    </a>
  )
}

// Streamdown's built-in elements carry their own utility classes; render plain tags so `prose` keeps styling them
const components: Components = {
  h1: "h1",
  h2: "h2",
  h3: "h3",
  h4: "h4",
  h5: "h5",
  h6: "h6",
  ul: "ul",
  ol: "ol",
  li: "li",
  strong: "strong",
  blockquote: "blockquote",
  hr: "hr",
  table: "table",
  thead: "thead",
  tbody: "tbody",
  tr: "tr",
  th: "th",
  td: "td",
  inlineCode: ({ node, ...props }) => <code {...props} />,
  // Code blocks keep Streamdown's renderer (handles unclosed fences), outside `prose` so its colors apply
  pre: (props) => (
    <div className="not-prose my-4">
      <defaultComponents.pre {...props} />
    </div>
  ),
  a: ({ node, href, children, ...props }) =>
    // Links still streaming in get this placeholder href; keep them as plain text until the URL is complete
    !href || href === "streamdown:incomplete-link" ? (
      <span>{children}</span>
    ) : (
      <NewTabLink {...props} href={href}>
        {children}
      </NewTabLink>
    ),
}

interface IProps {
  children: string
  className?: string
  isAnimating?: boolean
}

export default function LumiMarkdown({ children, className, isAnimating }: IProps) {
  return (
    <Streamdown className={clsx("prose max-w-none", className)} components={components} isAnimating={isAnimating}>
      {children}
    </Streamdown>
  )
}
