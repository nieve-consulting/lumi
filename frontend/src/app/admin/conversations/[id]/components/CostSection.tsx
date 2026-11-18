import type { Thread } from "@/generated/graphql"

import { formatCost } from "@/lib/utils"

import ModelUsageTable from "../../../components/ModelUsageTable"

interface IProps {
  thread: Pick<Thread, "cost" | "usage">
  className?: string
}

export default function CostSection({ thread: { cost, usage }, className }: IProps) {
  return (
    <div className={className}>
      <h3 className="text-lg font-semibold">
        Cost <span className="tabular-nums">{cost == null ? "--" : formatCost(cost)}</span>
      </h3>
      {usage.length === 0 ? (
        <p className="mt-2 text-sm text-slate-500">Unknown: no usage was recorded for this conversation.</p>
      ) : (
        <>
          <p className="mt-2 mb-4 text-sm text-slate-500">
            {cost == null && "Unknown: some model calls have no price, so the total would be incomplete. "}
            Every model call of the conversation: agent turns, helpers and summaries. Cached input and cache writes are part of the input, reasoning
            is part of the output.
          </p>
          <ModelUsageTable usage={usage} detailed />
        </>
      )}
    </div>
  )
}
