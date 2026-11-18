import Image from "next/image"

import { useBusiness } from "@/lib/BusinessProvider"

interface IProps {
  toolProgress?: string
}

export default function AssistantThinking({ toolProgress }: IProps) {
  const { avatar, assistantName } = useBusiness()

  return (
    <div className="my-2 mr-36 flex gap-2">
      <Image src={avatar} alt={assistantName} width={80} height={80} className="size-10 shrink-0 object-contain" />
      <div className="content-center p-2">
        <div className="mt-2 inline-block size-3 animate-ping rounded-full bg-slate-400" />
        {toolProgress && <span className="ml-3 animate-pulse text-xs text-slate-400">{toolProgress}</span>}
      </div>
    </div>
  )
}
