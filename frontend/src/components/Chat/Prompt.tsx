import { useCallback, useEffect, useId, useImperativeHandle, useLayoutEffect, useRef, useState } from "react"
import { countCharacters, MAX_MESSAGE_LENGTH } from "@lumi/shared-contracts/pre-sales"
import { CircleStop, SendHorizonal } from "lucide-react"

import { useI18n } from "@/lib/i18n/LanguageProvider"
import { cn, hasFinePointer, isComposingKey } from "@/lib/utils"
import { Button } from "@/components/ui/button"

export interface PromptHandle {
  focus: () => void
}

interface IProps {
  ref?: React.Ref<PromptHandle>
  // Focuses the message box whenever it scrolls into view
  focusWhenVisible?: boolean
  className?: string
  input: string
  handleInputChange: (e: React.ChangeEvent<HTMLTextAreaElement>) => void
  handleSubmit: () => void
  handleCancel: () => void
  isLoading: boolean
  disabled?: boolean
}

// Browsers with CSS field-sizing grow the textarea with its content themselves (field-sizing-content); the others are measured
const supportsFieldSizing = () => CSS.supports("field-sizing", "content")

export default function Prompt({
  ref,
  focusWhenVisible = true,
  className,
  input,
  handleInputChange,
  handleSubmit,
  isLoading,
  handleCancel,
  disabled,
}: IProps) {
  const { language, t } = useI18n()
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const formRef = useRef<HTMLFormElement>(null)
  const hintId = useId()
  const statusId = useId()

  const [isVisible, setIsVisible] = useState(false)
  // Drafts over the limit are kept so the visitor can shorten them, but can't be sent
  const length = countCharacters(input)
  const charactersLeft = MAX_MESSAGE_LENGTH - length
  const isOverLimit = charactersLeft < 0
  const showCounter = length > MAX_MESSAGE_LENGTH * 0.8
  const formatCount = (count: number) => count.toLocaleString(language)

  useEffect(() => {
    const input = inputRef.current

    if (input && focusWhenVisible) {
      const observer = new IntersectionObserver(
        ([entry]) => {
          if (entry.isIntersecting) {
            setIsVisible(true)
          } else {
            setIsVisible(false)
          }
        },
        { threshold: 0.3 } // Adjust as needed for when you consider the input "visible"
      )

      observer.observe(input)

      return () => {
        if (input) {
          observer.unobserve(input)
        }
      }
    }
  }, [focusWhenVisible])

  useEffect(() => {
    if (isVisible && inputRef.current) inputRef.current.focus()
  }, [isVisible])

  useImperativeHandle(ref, () => ({ focus: () => inputRef.current?.focus() }), [])

  // Grows the textarea with its content; past its max height it scrolls instead
  const fitHeight = useCallback(() => {
    const textarea = inputRef.current
    if (!textarea || supportsFieldSizing()) return

    textarea.style.height = "auto"
    const { borderTopWidth, borderBottomWidth, maxHeight } = getComputedStyle(textarea)
    const height = textarea.scrollHeight + parseFloat(borderTopWidth) + parseFloat(borderBottomWidth)
    textarea.style.height = `${height}px`
    // scrollHeight is rounded, so at fractional zoom levels the content can overflow by under a pixel. Only show a scrollbar
    // once the content is past the max height
    textarea.style.overflowY = height > parseFloat(maxHeight) ? "auto" : "hidden"
  }, [])

  useLayoutEffect(fitHeight, [input, fitHeight])

  // Text rewraps when the width changes, e.g. once the layout settles or the window is resized. The height is fitted in the
  // next frame: resizing the observed textarea inside the callback would raise a ResizeObserver loop error
  useEffect(() => {
    const textarea = inputRef.current
    if (!textarea || supportsFieldSizing()) return

    let width = textarea.clientWidth
    let frame = 0
    const observer = new ResizeObserver(() => {
      if (textarea.clientWidth === width) return
      width = textarea.clientWidth
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(fitHeight)
    })

    observer.observe(textarea)
    return () => {
      observer.disconnect()
      cancelAnimationFrame(frame)
    }
  }, [fitHeight])

  function internalHandleSubmit() {
    if (isLoading) handleCancel()
    else if (!isOverLimit) handleSubmit()
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    // Shift+Enter, and Enter while an IME composes text, insert a new line
    if (e.key !== "Enter" || e.shiftKey || isComposingKey(e.nativeEvent)) return
    // Without a mouse or trackpad (phones, tablets on their own) Enter inserts a new line and the send button sends
    if (!hasFinePointer()) return

    e.preventDefault()
    if (!isLoading) formRef.current?.requestSubmit()
  }

  return (
    // min-w-0: with field-sizing the textarea's minimum width is its longest unbroken word, which would widen the row
    <div className={cn("min-w-0", className)}>
      {/* The hint only shows with a mouse or trackpad, so without one the row only takes space once the counter appears */}
      <div
        className={cn(
          "flex justify-between gap-x-2 px-1 text-xs text-slate-500",
          showCounter ? "min-h-4 pb-1" : "any-pointer-fine:min-h-4 any-pointer-fine:pb-1"
        )}
      >
        {/* Part of the textarea's description even while hidden, since screen readers read referenced hidden text */}
        <span id={hintId} className={cn(isOverLimit ? "hidden" : "hidden any-pointer-fine:inline", !input && "invisible")}>
          {t.prompt.newLineHint}
        </span>
        <span id={statusId} className={cn(isOverLimit ? "text-red-600" : "ml-auto text-right")}>
          {/* The live region keeps fixed wording so the warning is announced once, not on every keystroke */}
          <span aria-live="polite">{isOverLimit && t.prompt.overLimit(formatCount(MAX_MESSAGE_LENGTH))}</span>
          {isOverLimit
            ? ` ${t.prompt.charactersOver(formatCount(-charactersLeft))}`
            : showCounter && t.prompt.charactersLeft(formatCount(charactersLeft))}
        </span>
      </div>
      <form ref={formRef} action={internalHandleSubmit} className="flex grow items-end gap-x-2">
        <textarea
          ref={inputRef}
          className={cn(
            "field-sizing-content max-h-40 w-full resize-none rounded-md border border-slate-200 bg-white p-2",
            isOverLimit && "border-red-500 focus-visible:outline-red-500"
          )}
          rows={1}
          value={input}
          onChange={handleInputChange}
          onKeyDown={handleKeyDown}
          placeholder={disabled ? t.prompt.closedPlaceholder : t.prompt.placeholder}
          aria-label={t.prompt.label}
          aria-invalid={isOverLimit}
          aria-describedby={`${hintId} ${statusId}`}
          disabled={disabled}
        />
        <Button
          className="shrink-0 rounded-md p-2 [&_svg]:size-6"
          disabled={disabled || (!isLoading && isOverLimit)}
          aria-label={isLoading ? t.prompt.stop : t.prompt.send}
        >
          {isLoading ? <CircleStop /> : <SendHorizonal />}
        </Button>
      </form>
    </div>
  )
}
