import clsx from "clsx"
import { AlertCircle } from "lucide-react"

interface IProps {
  error: string
  className?: string
}

export default function ErrorCard({ error, className }: IProps) {
  return (
    <div className={clsx("text-destructive rounded-md border border-slate-200 bg-white p-2", className)}>
      <AlertCircle size={20} className="mr-2 inline-block" />
      {error}
    </div>
  )
}
