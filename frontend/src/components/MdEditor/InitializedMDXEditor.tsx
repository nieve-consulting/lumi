"use client"

import type { ForwardedRef } from "react"
import {
  BlockTypeSelect,
  BoldItalicUnderlineToggles,
  CreateLink,
  headingsPlugin,
  linkDialogPlugin,
  linkPlugin,
  listsPlugin,
  ListsToggle,
  markdownShortcutPlugin,
  MDXEditor,
  quotePlugin,
  thematicBreakPlugin,
  toolbarPlugin,
  type MDXEditorMethods,
  type MDXEditorProps,
} from "@mdxeditor/editor"

import { cn } from "@/lib/utils"

import "@mdxeditor/editor/style.css"
import "./styles.css"

export type IEditorProps = { editorRef: ForwardedRef<MDXEditorMethods> } & Omit<MDXEditorProps, "markdown"> & {
    defaultValue?: string
    value?: string
    className?: string
  }

// Only import this to the next file
export default function InitializedMDXEditor({ editorRef, defaultValue, className, ...props }: IEditorProps) {
  return (
    <div className={cn("overflow-y-auto rounded-md border border-gray-200", className)}>
      <MDXEditor
        {...props}
        markdown={defaultValue || ""}
        contentEditableClassName="mdxeditor__contenteditable"
        plugins={[
          headingsPlugin(),
          linkPlugin(),
          linkDialogPlugin(),
          toolbarPlugin({
            toolbarContents: () => (
              <>
                <BoldItalicUnderlineToggles />
                <BlockTypeSelect />
                <ListsToggle options={["number", "bullet"]} />
                <CreateLink />
              </>
            ),
          }),
          listsPlugin({ orderedList: { className: "list-decimal" }, unorderedList: { className: "list-disc" } }),
          quotePlugin(),
          thematicBreakPlugin(),
          markdownShortcutPlugin(),
        ]}
        ref={editorRef}
      />
    </div>
  )
}
