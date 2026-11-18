"use client"

import { Fragment, useId, useRef, useState } from "react"
import type { ReactTable } from "@tanstack/react-table"
import { ChevronDown, CircleCheck, CircleMinus, CircleX, Clock, LoaderCircle, Sparkles } from "lucide-react"

import type { DataTableFeatures } from "@/lib/dataTable"
import { cn } from "@/lib/utils"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Progress } from "@/components/ui/progress"
import type { TranslateDraftsType } from "@/app/api/translate/drafts/route"

import { BULK_TRANSLATE_MODES, countOf, languageLabel, TRANSLATION_LANGUAGES, type BulkTranslateMode, type Language } from "./languages"
import { translationColumnId, translationFilter, TranslationStatusFilters } from "./translationColumns"
import { useBulkTranslation, type BulkItem, type BulkItemState } from "./useBulkTranslation"

// A records list's row, which bulk translation names in its progress by `getName`
interface BulkRow {
  id: string
}

interface IProps<TData extends BulkRow> {
  // The list's table, with a selection column (selectionColumn) and translation columns (translationColumns)
  table: ReactTable<DataTableFeatures, TData>
  type: TranslateDraftsType
  // The records' name, e.g. { singular: "team member", plural: "team members" }, and their nested items' with their own
  // translations, if any, e.g. "experiences"
  names: { singular: string; plural: string; nested?: string }
  // The row's name in the progress, e.g. a client's name or a job opening's title
  getName: (row: TData) => string
  // Whether the record has something to translate into the language in the mode: its own translation, or a nested item's
  // with English text, is missing, or outdated too (needsBulkTranslation)
  needsTranslation: (row: TData, language: Language, mode: BulkTranslateMode) => boolean
}

type Scope = "selected" | "all"

// What each mode translates, e.g. "missing or outdated Spanish"
const modeLabels: Record<BulkTranslateMode, string> = {
  missing: "missing",
  missing_or_outdated: "missing or outdated",
}

const stateLabels: Record<Exclude<BulkItemState["status"], "skipped">, string> = {
  waiting: "Waiting",
  translating: "Translating...",
  saved: "Saved as draft",
  failed: "Failed",
  stopped: "Stopped",
}

const stateLabel = (status: BulkItemState["status"], mode: BulkTranslateMode) =>
  status === "skipped" ? `Skipped: nothing ${modeLabels[mode]}` : stateLabels[status]

function StateIcon({ state }: { state: BulkItemState }) {
  const className = "mt-0.5 size-4 shrink-0"
  switch (state.status) {
    case "waiting":
      return <Clock className={cn(className, "text-slate-400")} aria-hidden />
    case "translating":
      return <LoaderCircle className={cn(className, "animate-spin text-slate-600")} aria-hidden />
    case "saved":
      return <CircleCheck className={cn(className, "text-emerald-600")} aria-hidden />
    case "failed":
      return <CircleX className={cn(className, "text-red-600")} aria-hidden />
    default:
      return <CircleMinus className={cn(className, "text-slate-400")} aria-hidden />
  }
}

function ItemRow({ item, mode }: { item: BulkItem; mode: BulkTranslateMode }) {
  const { state } = item
  const detail =
    state.status === "failed"
      ? state.error
      : state.status === "saved" && state.untranslated > 0
        ? mode === "missing"
          ? `${countOf(state.untranslated, "field was", "fields were")} left for you to translate.`
          : // A replaced translation keeps its outdated text in those fields, and stays outdated until reviewed
            `${countOf(state.untranslated, "field was", "fields were")} left for you to translate, or to review where the outdated translation kept its text.`
        : undefined

  return (
    <li className="flex gap-2 py-2 text-sm">
      <StateIcon state={state} />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap justify-between gap-x-3">
          <span className="truncate font-medium">{item.name}</span>
          <span className={cn("text-slate-500", state.status === "failed" && "text-red-700", state.status === "saved" && "text-emerald-700")}>
            {stateLabel(state.status, mode)}
          </span>
        </div>
        {detail && <p className={cn("text-slate-500", state.status === "failed" && "text-red-700")}>{detail}</p>}
      </div>
    </li>
  )
}

// A language menu's choices: what to translate, what's missing or what's outdated too, for the selected records or all,
// with how many records each translates. Rendered only while the menu is open, so the records are counted then rather
// than on every render of the list, e.g. at each step of a batch
function ScopeItems({
  language,
  plural,
  selected,
  countSelected,
  countAll,
  onSelect,
}: {
  language: Language
  plural: string
  selected: number
  countSelected: (mode: BulkTranslateMode) => number
  countAll: (mode: BulkTranslateMode) => number
  onSelect: (scope: Scope, mode: BulkTranslateMode) => void
}) {
  const id = useId()

  return BULK_TRANSLATE_MODES.map((mode, index) => {
    const inSelected = countSelected(mode)
    const inAll = countAll(mode)
    const labelId = `${id}-${mode}`
    return (
      <Fragment key={mode}>
        {index > 0 && <DropdownMenuSeparator />}
        {/* Named by its label, which also describes each choice, as their names repeat across the groups */}
        <DropdownMenuGroup aria-labelledby={labelId}>
          <DropdownMenuLabel id={labelId} className="text-slate-500">
            {modeLabels[mode].charAt(0).toUpperCase() + modeLabels[mode].slice(1)} {languageLabel(language)}
          </DropdownMenuLabel>
          <DropdownMenuItem aria-describedby={labelId} disabled={inSelected === 0} onSelect={() => onSelect("selected", mode)}>
            {selected === 0 ? `Selected ${plural} (none selected)` : `Selected ${plural} (${inSelected} of ${selected})`}
          </DropdownMenuItem>
          <DropdownMenuItem aria-describedby={labelId} disabled={inAll === 0} onSelect={() => onSelect("all", mode)}>
            All {plural} ({inAll})
          </DropdownMenuItem>
        </DropdownMenuGroup>
      </Fragment>
    )
  })
}

// Above a records list: filters by translation status (TranslationStatusFilters), how many records are selected, and
// "Translate <language> with AI" for the selected records or all, translating what's missing in the language, or also
// re-translating what's outdated there. A dialog confirms what will be translated, then shows each record's progress; the
// AI translations are saved as drafts the team reviews in each record's form
export default function BulkTranslateToolbar<TData extends BulkRow>({ table, type, names, needsTranslation, getName }: IProps<TData>) {
  const bulk = useBulkTranslation(type)
  const [request, setRequest] = useState<{ language: Language; scope: Scope; mode: BulkTranslateMode } | null>(null)
  const [confirmingStop, setConfirmingStop] = useState(false)
  // Closed, while the dialog animates out: it keeps showing its content until then
  const [closing, setClosing] = useState(false)
  // The menu button the dialog was opened from, which takes focus back when it closes: the menu item is gone by then
  const triggerRef = useRef<HTMLButtonElement | null>(null)
  const triggerRefs = useRef(new Map<Language, HTMLButtonElement>())

  const selected = table.getSelectedRowModel().rows.map((row) => row.original)
  const all = table.getCoreRowModel().rows.map((row) => row.original)
  const toTranslateIn = (rows: TData[], language: Language, mode: BulkTranslateMode) => rows.filter((row) => needsTranslation(row, language, mode))

  const open = !closing && (request !== null || bulk.items.length > 0)
  const language = bulk.language ?? request?.language
  const mode = request?.mode ?? bulk.mode
  const target = request ? toTranslateIn(request.scope === "selected" ? selected : all, request.language, request.mode) : []
  const skippedUpFront = request?.scope === "selected" ? selected.length - target.length : 0

  const count = (status: BulkItemState["status"]) => bulk.items.filter((item) => item.state.status === status).length
  const saved = count("saved")
  const failed = count("failed")
  const stopped = count("stopped")
  const done = saved + failed + count("skipped")
  const outcome = bulk.running ? "" : stopped > 0 ? "Stopped: " : "Finished: "

  function startBatch() {
    if (!request) return
    bulk.start(
      target.map((row) => ({ id: row.id, name: getName(row) })),
      request.language,
      request.mode
    )
    setRequest(null)
  }

  function close() {
    // Records saved as drafts are done: a later "Selected..." run won't pick them up hidden by a filter or on another page
    if (saved > 0) table.resetRowSelection()
    setClosing(true)
  }

  // Once the dialog has animated out
  function clear() {
    bulk.reset()
    setRequest(null)
    setClosing(false)
  }

  function openRequest(language: Language, scope: Scope, mode: BulkTranslateMode) {
    triggerRef.current = triggerRefs.current.get(language) ?? null
    setRequest({ language, scope, mode })
  }

  // Closing while it runs asks before stopping; once stopping, it stays open until the records in flight finish
  function onOpenChange(next: boolean) {
    if (next) return
    if (bulk.running) {
      if (!bulk.stopping) setConfirmingStop(true)
    } else {
      close()
    }
  }

  function showDrafts() {
    if (language) table.getColumn(translationColumnId(language))?.setFilterValue(translationFilter("draft"))
    close()
  }

  const selectedCount = selected.length

  return (
    <>
      <div className="flex flex-wrap items-end gap-3">
        <TranslationStatusFilters table={table} />
        <div className="ml-auto flex flex-wrap items-center justify-end gap-3">
          {selectedCount > 0 && (
            <span className="text-sm text-slate-600">
              {selectedCount} selected
              <Button variant="link" size="sm" className="h-auto px-2" onClick={() => table.resetRowSelection()}>
                Clear
              </Button>
            </span>
          )}
          {TRANSLATION_LANGUAGES.map((option) => (
            // Not modal, so the dialog it opens takes focus as the menu closes
            <DropdownMenu key={option} modal={false}>
              <DropdownMenuTrigger asChild>
                <Button
                  ref={(button) => {
                    if (button) triggerRefs.current.set(option, button)
                  }}
                  variant="outline"
                  size="sm"
                  disabled={bulk.running}
                >
                  <Sparkles aria-hidden />
                  Translate into {languageLabel(option)} with AI
                  <ChevronDown aria-hidden />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <ScopeItems
                  language={option}
                  plural={names.plural}
                  selected={selected.length}
                  countSelected={(mode) => toTranslateIn(selected, option, mode).length}
                  countAll={(mode) => toTranslateIn(all, option, mode).length}
                  onSelect={(scope, mode) => openRequest(option, scope, mode)}
                />
              </DropdownMenuContent>
            </DropdownMenu>
          ))}
        </div>
      </div>

      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent
          className="max-h-[calc(100dvh-2rem)] overflow-y-auto"
          // Runs once the dialog has animated out
          onCloseAutoFocus={(e) => {
            clear()
            if (!triggerRef.current) return
            e.preventDefault()
            triggerRef.current.focus()
          }}
        >
          {request && language ? (
            <>
              <DialogHeader>
                <DialogTitle>
                  Translate {countOf(target.length, names.singular, names.plural)} into {languageLabel(language)}?
                </DialogTitle>
                <DialogDescription>
                  {mode === "missing" ? (
                    <>
                      AI fills in only what&apos;s missing in {languageLabel(language)}
                      {names.nested ? `, including ${names.nested}` : ""}. Translations are saved as drafts: visitors see English until you review and
                      save each one.
                    </>
                  ) : (
                    <>
                      AI fills in what&apos;s missing in {languageLabel(language)} and re-translates what&apos;s outdated
                      {names.nested ? `, including ${names.nested}` : ""}. Outdated translations, reviewed ones and AI drafts alike, are replaced by
                      new AI drafts that keep their wording where it still fits the English. Visitors see English until you review and save each one.
                    </>
                  )}
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-2 text-sm">
                {skippedUpFront > 0 && (
                  <p>
                    {mode === "missing"
                      ? `${countOf(skippedUpFront, `selected ${names.singular} already has`, `selected ${names.plural} already have`)} ${languageLabel(language)}`
                      : `${countOf(skippedUpFront, `selected ${names.singular} has`, `selected ${names.plural} have`)} nothing missing or outdated in ${languageLabel(language)}`}{" "}
                    and {skippedUpFront === 1 ? "is" : "are"} skipped.
                  </p>
                )}
                <p>This can take a few minutes.</p>
              </div>
              <DialogFooter className="gap-2">
                <Button variant="outline" onClick={close}>
                  Cancel
                </Button>
                <Button onClick={startBatch} disabled={target.length === 0}>
                  <Sparkles aria-hidden />
                  Translate {countOf(target.length, names.singular, names.plural)}
                </Button>
              </DialogFooter>
            </>
          ) : (
            language && (
              <>
                <DialogHeader>
                  <DialogTitle>
                    {bulk.stopping
                      ? "Stopping: finishing the records in progress"
                      : bulk.running
                        ? `Translating ${names.plural} into ${languageLabel(language)}`
                        : stopped > 0
                          ? "Translation stopped"
                          : "Translation finished"}
                  </DialogTitle>
                  {/* Announces the progress as records finish, and how the batch ended */}
                  <DialogDescription aria-live="polite">
                    {outcome}
                    {done} of {bulk.items.length} done
                    {saved > 0 && ` · ${saved} saved as ${saved === 1 ? "draft" : "drafts"}`}
                    {failed > 0 && ` · ${failed} failed`}
                    {stopped > 0 && ` · ${stopped} stopped`}
                  </DialogDescription>
                </DialogHeader>
                <Progress value={done} max={bulk.items.length} aria-label="Translation progress" />
                <ul className="max-h-80 divide-y divide-slate-100 overflow-y-auto pr-1">
                  {bulk.items.map((item) => (
                    <ItemRow key={item.id} item={item} mode={bulk.mode} />
                  ))}
                </ul>
                {!bulk.running && saved > 0 && (
                  <p className="rounded-md border border-sky-300 bg-sky-50 p-3 text-sm text-sky-950">
                    Drafts aren&apos;t live yet: visitors see English until you open each {names.singular} with an AI draft and save its{" "}
                    {languageLabel(language)} translation.
                  </p>
                )}
                <DialogFooter className="gap-2">
                  {bulk.running ? (
                    <Button variant="outline" onClick={() => setConfirmingStop(true)} disabled={bulk.stopping}>
                      {bulk.stopping ? "Stopping..." : "Stop"}
                    </Button>
                  ) : (
                    <>
                      {failed > 0 && (
                        <Button variant="outline" onClick={bulk.retryFailed}>
                          Retry failed ({failed})
                        </Button>
                      )}
                      {saved > 0 ? (
                        <>
                          <Button variant="outline" onClick={close}>
                            Close
                          </Button>
                          <Button onClick={showDrafts}>Show drafts to review</Button>
                        </>
                      ) : (
                        <Button onClick={close}>Close</Button>
                      )}
                    </>
                  )}
                </DialogFooter>
              </>
            )
          )}
        </DialogContent>
      </Dialog>

      <AlertDialog open={confirmingStop} onOpenChange={setConfirmingStop}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Stop translating?</AlertDialogTitle>
            <AlertDialogDescription>
              {names.plural.charAt(0).toUpperCase() + names.plural.slice(1)} not started yet are left as they are. Those being translated now finish
              first, and drafts already saved stay saved.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep translating</AlertDialogCancel>
            <AlertDialogAction onClick={bulk.stop}>Stop translating</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
