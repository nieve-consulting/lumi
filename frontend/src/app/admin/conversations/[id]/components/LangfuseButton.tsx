import { Activity } from "lucide-react"

import { Button } from "@/components/ui/button"

interface IProps {
  href: string
}

export default function LangfuseButton({ href }: IProps) {
  return (
    <Button variant="secondary" className="p-1" asChild>
      <a href={href} target="_blank" rel="noreferrer">
        <Activity size={18} className="mr-2" /> Open in Langfuse
      </a>
    </Button>
  )
}
