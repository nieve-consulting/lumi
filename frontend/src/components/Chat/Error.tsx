import { RotateCcw, TriangleAlert } from "lucide-react"

import { useI18n } from "@/lib/i18n/LanguageProvider"

import { Button } from "../ui/button"
import { ContactButton } from "./customCards/MeetingPicker"
import type { ChatErrorAction } from "./hooks/lumiChat"

interface IProps {
  // The Reload button
  ref?: React.Ref<HTMLButtonElement>
  message: string
  // Without one, the message is all there is, e.g. when the closed conversation's notice below offers a new one
  action?: ChatErrorAction
  reload: () => void
}

export default function Error({ ref, message, action, reload }: IProps) {
  const { t } = useI18n()

  return (
    <div className="mx-auto px-6 py-3 text-center text-red-400">
      {/* Announced as it shows, as focus usually stays where it was, e.g. in the message box */}
      <div role="alert" className="mb-2 flex gap-2">
        <TriangleAlert aria-hidden />
        <div>{message}</div>
      </div>
      {action === "reload" && (
        <Button ref={ref} variant="outline" onClick={reload}>
          <RotateCcw className="mr-2" />
          {t.errors.reload}
        </Button>
      )}
      {action === "contact" && <ContactButton variant="outline" />}
    </div>
  )
}
