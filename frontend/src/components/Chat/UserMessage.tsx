import { forwardRef } from "react"

import { getMessageText, type LumiMessage } from "@/lib/types"

interface IProps {
  tabIndex?: number
  message: LumiMessage
}

const UserMessage = forwardRef<HTMLDivElement, IProps>(({ tabIndex, message }, ref) => {
  return (
    <div className="my-2 ml-6 flex justify-end gap-2 md:ml-36" ref={ref} tabIndex={tabIndex}>
      <div className="bg-primary min-w-0 rounded-md p-2 break-words whitespace-pre-wrap text-white">{getMessageText(message)}</div>
    </div>
  )
})

UserMessage.displayName = "UserMessage"

export default UserMessage
