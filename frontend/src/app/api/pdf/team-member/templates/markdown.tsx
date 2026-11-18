import { ExternalLink } from "lucide"
import MarkdownToJsx from "markdown-to-jsx"

import LucideIcon from "./LucideIcon"

interface IProps {
  children: string
}

// Renders a team member's Markdown in the resume. The PDF renderer loads what the page links, so raw HTML (e.g. <img>, <object>
// or <iframe>) is shown as text and images are left out: a bio can't make the server fetch an address of its choosing
export default function Markdown({ children }: IProps) {
  return (
    <MarkdownToJsx
      options={{
        disableParsingRawHTML: true,
        overrides: {
          img: { component: () => null },
          a: {
            component: ({ node, ...props }) => (
              <a {...props} target="_blank" rel="noreferrer">
                {props.children}
                <LucideIcon icon={ExternalLink} size={15} className="ml-1 inline" />
              </a>
            ),
          },
          strong: {
            component: ({ node, ...props }) => (
              <strong {...props} className="font-bold">
                {props.children}
              </strong>
            ),
          },
          p: {
            component: ({ node, ...props }) => (
              <p {...props} className="my-2">
                {props.children}
              </p>
            ),
          },
          li: {
            component: ({ node, ...props }) => (
              <li {...props} className="ml-6 list-disc">
                {props.children}
              </li>
            ),
          },
        },
      }}
    >
      {children}
    </MarkdownToJsx>
  )
}
