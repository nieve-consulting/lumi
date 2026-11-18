"use client"

import { inSentence } from "@lumi/shared-contracts/knowledge"
import { CirclePlus } from "lucide-react"

import { Button } from "@/components/ui/button"
import { useSourceLabels } from "@/app/admin/components/SourceLabelsProvider"

import { useCapabilityStore } from "../storeProvider"

export default function CreateButton() {
  const { setItemForForm } = useCapabilityStore((state) => state)
  const { singular } = useSourceLabels().capabilities

  return (
    <Button onClick={() => setItemForForm("new")}>
      <CirclePlus className="mr-2" />
      New {inSentence(singular)}
    </Button>
  )
}
