"use client"

import { useState } from "react"
import type { Enquiry, EnquiryDelivery } from "@/generated/graphql"
import { DELIVERY_CHANNEL_LABELS, ENQUIRY_FIELD_LABELS } from "@lumi/shared-contracts/handoff"
import { RotateCw } from "lucide-react"
import { DateTime } from "luxon"

import { cn } from "@/lib/utils"
import { LoadingButton, LoadingButtonState } from "@/components/ui/loading-button"

import { retryDelivery } from "../actions"

interface IProps {
  // Newest first
  enquiries: Enquiry[]
  className?: string
}

// Keyed by the API's plain strings, which may name a field or channel type this version doesn't know
const FIELD_LABELS: Partial<Record<string, string>> = ENQUIRY_FIELD_LABELS

const CHANNEL_LABELS: Partial<Record<string, string>> = DELIVERY_CHANNEL_LABELS

const ENQUIRY_STATUS: Record<string, { label: string; className: string }> = {
  delivered: { label: "Delivered", className: "bg-green-100 text-green-800" },
  partial: { label: "Partly delivered", className: "bg-amber-100 text-amber-900" },
  failed: { label: "Not delivered", className: "bg-red-100 text-red-800" },
  pending: { label: "Sending", className: "bg-slate-100 text-slate-700" },
}

const DELIVERY_STATUS: Record<string, { label: string; className: string }> = {
  delivered: { label: "Delivered", className: "text-green-800" },
  failed: { label: "Failed", className: "text-red-700" },
  pending: { label: "Sending", className: "text-slate-600" },
}

// ISO times, or milliseconds since the epoch
function formatTime(value: string | null | undefined) {
  if (!value) return "--"
  const time = /^\d+$/.test(value) ? DateTime.fromMillis(Number(value)) : DateTime.fromISO(value)
  return time.isValid ? time.toFormat("LLL d, yyyy HH:mm") : value
}

function StatusBadge({ status }: { status: string }) {
  const { label, className } = ENQUIRY_STATUS[status] ?? { label: status, className: "bg-slate-100 text-slate-700" }
  return <span className={cn("rounded-full px-2.5 py-0.5 text-xs font-semibold", className)}>{label}</span>
}

// Whether the team can send it again: some channel failed, or there was no channel to send it through
const retryable = ({ status, deliveries }: Enquiry) => status === "failed" || status === "partial" || deliveries.length === 0

function retryMessage({ status, deliveries }: Enquiry) {
  const failed = deliveries.filter((delivery) => delivery.status === "failed").length
  if (status === "delivered") return "Delivered: every channel accepted the enquiry."
  if (status === "partial") return `Partly delivered: ${failed} ${failed === 1 ? "channel is" : "channels are"} still failing. See the errors below.`
  if (status === "pending") return "Still sending. Reload the page in a moment to see how it went."
  return deliveries.length ? "Delivery failed again. See the errors below." : "There's no delivery channel to send it through. Add one in Settings."
}

function DeliveriesTable({ deliveries }: { deliveries: EnquiryDelivery[] }) {
  if (!deliveries.length) return <p className="text-sm text-slate-600">No delivery channel was set up when it was sent.</p>

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[640px] text-left text-sm">
        <caption className="sr-only">Deliveries</caption>
        <thead className="border-b border-slate-200 text-xs text-slate-500">
          <tr>
            <th scope="col" className="py-2 pr-4 font-medium">
              Channel
            </th>
            <th scope="col" className="py-2 pr-4 font-medium">
              Destination
            </th>
            <th scope="col" className="py-2 pr-4 font-medium">
              Status
            </th>
            <th scope="col" className="py-2 pr-4 font-medium">
              Attempts
            </th>
            <th scope="col" className="py-2 pr-4 font-medium">
              Delivered
            </th>
            <th scope="col" className="py-2 font-medium">
              Last error
            </th>
          </tr>
        </thead>
        <tbody>
          {deliveries.map((delivery) => {
            const status = DELIVERY_STATUS[delivery.status] ?? { label: delivery.status, className: "" }
            return (
              <tr key={delivery.channelKey} className="border-b border-slate-100 align-top">
                <td className="py-2 pr-4">{CHANNEL_LABELS[delivery.channelType] ?? delivery.channelType}</td>
                <td className="py-2 pr-4 break-all">{delivery.destination ?? <i className="text-slate-500">Channel removed</i>}</td>
                <td className={cn("py-2 pr-4 font-medium", status.className)}>{status.label}</td>
                <td className="py-2 pr-4 tabular-nums">{delivery.attempts}</td>
                <td className="py-2 pr-4 whitespace-nowrap">{formatTime(delivery.deliveredAt)}</td>
                <td className="py-2 break-words text-slate-700">{delivery.status === "delivered" ? "--" : (delivery.lastError ?? "--")}</td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

function EnquiryCard({ enquiry: initial }: { enquiry: Enquiry }) {
  const [enquiry, setEnquiry] = useState(initial)
  const [retrying, setRetrying] = useState(false)
  const [result, setResult] = useState<{ ok: boolean; message: string }>()

  async function retry() {
    setRetrying(true)
    setResult(undefined)
    try {
      const outcome = await retryDelivery(enquiry.id)
      if (outcome.ok) {
        setEnquiry(outcome.enquiry)
        setResult({ ok: outcome.enquiry.status === "delivered", message: retryMessage(outcome.enquiry) })
      } else {
        setResult({ ok: false, message: outcome.error })
      }
    } catch (error) {
      console.error("Retrying the enquiry delivery failed", error)
      setResult({ ok: false, message: "The delivery couldn't be retried. Try again in a moment." })
    } finally {
      setRetrying(false)
    }
  }

  const contact = enquiry.contact.filter(({ value }) => value)
  const canRetry = retryable(enquiry)

  return (
    <article aria-labelledby={`enquiry-${enquiry.id}`} className="space-y-4 rounded-md border border-slate-200 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <h4 id={`enquiry-${enquiry.id}`} className="font-semibold">
            Submitted {formatTime(enquiry.createdAt)}
          </h4>
          <StatusBadge status={enquiry.status} />
        </div>
        {(canRetry || result) && (
          <LoadingButton
            variant="outline"
            size="sm"
            state={retrying ? LoadingButtonState.Loading : LoadingButtonState.Idle}
            loadingText="Retrying…"
            disabled={!canRetry}
            onClick={retry}
          >
            <RotateCw aria-hidden /> Retry delivery
          </LoadingButton>
        )}
      </div>
      {/* Stays mounted so the result is announced */}
      <p role="status" className={cn("text-sm font-medium", result?.ok ? "text-green-800" : "text-red-700", !result && "sr-only")}>
        {retrying ? "Retrying delivery…" : (result?.message ?? "")}
      </p>
      <dl className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-[max-content_1fr]">
        {contact.map(({ field, value }) => (
          <div key={field} className="contents">
            <dt className="text-slate-500">{FIELD_LABELS[field] ?? field}</dt>
            <dd className="break-words">
              {field === "email" ? (
                <a href={`mailto:${value}`} className="text-blue-700 underline">
                  {value}
                </a>
              ) : field === "phone" ? (
                <a href={`tel:${value.replace(/[^\d+]/g, "")}`} className="text-blue-700 underline">
                  {value}
                </a>
              ) : (
                value
              )}
            </dd>
          </div>
        ))}
        {enquiry.topic && (
          <div className="contents">
            <dt className="text-slate-500">Topic</dt>
            <dd className="break-words">{enquiry.topic}</dd>
          </div>
        )}
      </dl>
      {enquiry.qualification.length > 0 && (
        <div>
          <h5 className="mb-1 text-sm font-semibold">Qualification</h5>
          <dl className="space-y-2 text-sm">
            {enquiry.qualification.map(({ question, answer }, index) => (
              <div key={index}>
                <dt className="text-slate-500">{question}</dt>
                <dd className="break-words whitespace-pre-line">{answer || <i className="text-slate-500">No answer</i>}</dd>
              </div>
            ))}
          </dl>
        </div>
      )}
      {enquiry.message && (
        <div>
          <h5 className="mb-1 text-sm font-semibold">What they&apos;d like to discuss</h5>
          <p className="text-sm break-words whitespace-pre-line">{enquiry.message}</p>
        </div>
      )}
      <div>
        <h5 className="mb-1 text-sm font-semibold">Delivery</h5>
        <DeliveriesTable deliveries={enquiry.deliveries} />
      </div>
    </article>
  )
}

// The enquiries the visitor sent from the conversation, and whether they reached the team
export default function EnquirySection({ enquiries, className }: IProps) {
  if (!enquiries.length) return null

  return (
    <section aria-labelledby="enquiries-heading" className={className}>
      <h3 id="enquiries-heading" className="mb-3 text-lg font-semibold">
        {enquiries.length === 1 ? "Enquiry" : "Enquiries"}
      </h3>
      <div className="space-y-4">
        {enquiries.map((enquiry) => (
          <EnquiryCard key={enquiry.id} enquiry={enquiry} />
        ))}
      </div>
    </section>
  )
}
