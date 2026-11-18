"use client"

import { useEffect, useRef } from "react"
import dynamic from "next/dynamic"
import { type MDXEditorMethods } from "@mdxeditor/editor"

import { Skeleton } from "../ui/skeleton"
import type { IEditorProps } from "./InitializedMDXEditor"

const Editor = dynamic(() => import("./InitializedMDXEditor"), {
  ssr: false,
  loading: () => <Skeleton className="h-20" />,
})

type IProps = Omit<IEditorProps, "editorRef">

export default function MdEditor({ value, onChange, ...props }: IProps) {
  const editorRef = useRef<MDXEditorMethods>(null)

  useEffect(() => {
    editorRef.current?.setMarkdown(value || "")
  }, [value])

  // The editor reports its normalized version of the initial markdown (e.g. other bullet symbols) as a change; skipping it
  // keeps forms from reading as edited before the user types
  return (
    <Editor
      {...props}
      onChange={onChange && ((markdown, initialMarkdownNormalize) => !initialMarkdownNormalize && onChange(markdown, initialMarkdownNormalize))}
      editorRef={editorRef}
      defaultValue={value || ""}
    />
  )
}
