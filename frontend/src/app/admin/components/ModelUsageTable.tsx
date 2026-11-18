import type { ModelUsage } from "@/generated/graphql"

import { PURPOSE_LABELS } from "@/lib/models"
import { formatCost } from "@/lib/utils"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"

import { formatCompact, formatNumber, formatShare } from "./dashboard/format"

interface IProps {
  usage: ModelUsage[]
  // Exact token counts, cache writes and reasoning included, for a single conversation. Otherwise token counts are compact and
  // the cached input is shown as its share of the input, which suits the totals of many conversations
  detailed?: boolean
}

// Token usage and cost per purpose and model
export default function ModelUsageTable({ usage, detailed = false }: IProps) {
  const formatTokens = detailed ? formatNumber : formatCompact

  return (
    <div className="rounded-md border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Purpose</TableHead>
            <TableHead>Model</TableHead>
            <TableHead className="text-right">Calls</TableHead>
            <TableHead className="text-right">Input</TableHead>
            <TableHead className="text-right">Cached input</TableHead>
            {detailed && <TableHead className="text-right">Cache writes</TableHead>}
            <TableHead className="text-right">Output</TableHead>
            {detailed && <TableHead className="text-right">Reasoning</TableHead>}
            <TableHead className="text-right">Cost</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody className="tabular-nums">
          {usage.map((model) => (
            <TableRow key={`${model.purpose}-${model.model}`}>
              <TableCell className="font-medium">{PURPOSE_LABELS[model.purpose] ?? model.purpose}</TableCell>
              <TableCell>{model.model}</TableCell>
              <TableCell className="text-right">{formatNumber(model.calls)}</TableCell>
              <TableCell className="text-right">{formatTokens(model.inputTokens)}</TableCell>
              <TableCell className="text-right">
                {detailed ? formatTokens(model.cachedInputTokens) : formatShare(model.cachedInputTokens, model.inputTokens)}
              </TableCell>
              {detailed && <TableCell className="text-right">{formatTokens(model.cacheWriteTokens)}</TableCell>}
              <TableCell className="text-right">{formatTokens(model.outputTokens)}</TableCell>
              {detailed && <TableCell className="text-right">{formatTokens(model.reasoningTokens)}</TableCell>}
              <TableCell className="text-right whitespace-nowrap">{model.cost == null ? "No price" : formatCost(model.cost)}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  )
}
