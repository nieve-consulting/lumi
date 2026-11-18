import { useState } from "react"
import { useRouter } from "next/navigation"
import { ListEnd } from "lucide-react"

import { LoadingButton, LoadingButtonState } from "@/components/ui/loading-button"

interface IProps {
  summarize: () => Promise<void>
}

export default function SummarizeButton({ summarize }: IProps) {
  const [loading, setLoading] = useState<LoadingButtonState>(LoadingButtonState.Idle)
  const router = useRouter()

  async function handleSummarize() {
    setLoading(LoadingButtonState.Loading)
    try {
      await summarize()
    } finally {
      setLoading(LoadingButtonState.Idle)
      // The summary's model calls count towards the conversation cost, which the page renders on the server
      router.refresh()
    }
  }

  return (
    <LoadingButton variant="secondary" className="p-1" state={loading} onClick={handleSummarize} loadingText="Summarizing...">
      <ListEnd size={18} className="mr-2" /> Summarize
    </LoadingButton>
  )
}
