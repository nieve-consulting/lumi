"use client"

import { useEffect, useState } from "react"
import { useCompletion } from "@ai-sdk/react"
import { AlertTriangle, LoaderCircle, RotateCw, Sparkles } from "lucide-react"

import { Dialog, DialogClose, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"

import { Button } from "../ui/button"
import MdEditor from "./index"
import type { IEditorProps } from "./InitializedMDXEditor"

type IProps = Omit<IEditorProps, "editorRef"> & { prompt?: string }

export default function AiEditor({ prompt, ...props }: IProps) {
  const { value, onChange } = props

  const [dialogOpen, setDialogOpen] = useState(false)

  const { completion, complete, stop, isLoading, error } = useCompletion({
    api: "/api/completion",
    body: { systemPrompt: prompt, text: value },
    streamProtocol: "text",
  })

  // The proposal is editable; replace it whenever a new completion streams in
  const [proposedValue, setProposedValue] = useState(completion)
  const [lastCompletion, setLastCompletion] = useState(completion)
  if (completion !== lastCompletion) {
    setLastCompletion(completion)
    setProposedValue(completion)
  }

  useEffect(() => {
    if (dialogOpen) {
      complete("")
    }
  }, [dialogOpen, complete])

  function onSaveClicked() {
    const value = proposedValue || ""
    onChange?.(value, false)
    setDialogOpen(false)
  }

  return (
    <>
      <MdEditor {...props} />
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogTrigger asChild>
          <Button variant="secondary">
            <Sparkles className="mr-2" /> Help improve
          </Button>
        </DialogTrigger>
        <DialogContent className="sm:max-w-[75%]">
          <DialogHeader>
            <DialogTitle>
              {isLoading && (
                <>
                  <LoaderCircle className="mr-2 inline-block animate-spin" size={20} /> Improving text with AI...
                </>
              )}
              {!isLoading && "Improved text"}
            </DialogTitle>
          </DialogHeader>
          {error ? (
            <div className="text-center">
              <AlertTriangle size={50} className="text-destructive inline-block" />
              <div className="mt-3 text-slate-400">{error.message}</div>
            </div>
          ) : (
            <MdEditor value={proposedValue} onChange={setProposedValue} className="h-80" readOnly={isLoading} />
          )}
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="secondary" onClick={() => stop()}>
                Discard
              </Button>
            </DialogClose>
            <Button variant="secondary" title="Regenerate" disabled={isLoading} onClick={() => complete("")}>
              <RotateCw size={18} className="mr-2" />
            </Button>
            {error ? (
              <div className="bg-destructive flex items-center space-x-2 rounded px-3 text-white">
                <AlertTriangle size={20} />
              </div>
            ) : (
              <Button onClick={onSaveClicked} disabled={isLoading}>
                Apply
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
