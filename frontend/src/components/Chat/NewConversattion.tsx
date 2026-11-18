import { useState } from "react"
import { AlertTriangle, LoaderCircle } from "lucide-react"

import { useI18n } from "@/lib/i18n/LanguageProvider"
import { LoadingState } from "@/lib/types"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"

import { useChatStore } from "./store/store"

interface IProps {
  open: boolean
  setOpen: (open: boolean) => void
}

export default function NewConversation({ open, setOpen }: IProps) {
  const { t } = useI18n()
  const [newLoading, setNewLoading] = useState<LoadingState>(LoadingState.Idle)
  const { clearSessionThread } = useChatStore()

  async function onNewChat() {
    setNewLoading(LoadingState.Loading)
    try {
      await clearSessionThread()
      setNewLoading(LoadingState.Idle)
    } catch {
      setNewLoading(LoadingState.Error)
    }
  }

  return (
    <>
      <AlertDialog open={open} onOpenChange={setOpen}>
        <AlertDialogContent className="w-11/12">
          <AlertDialogHeader>
            <AlertDialogTitle>{t.newConversation.title}</AlertDialogTitle>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t.newConversation.cancel}</AlertDialogCancel>
            <AlertDialogAction onClick={onNewChat} disabled={newLoading != LoadingState.Idle}>
              {newLoading === LoadingState.Loading && (
                <>
                  <LoaderCircle className="mr-2 size-4 animate-spin" /> {t.newConversation.starting}
                </>
              )}
              {newLoading === LoadingState.Error && (
                <>
                  <AlertTriangle className="mr-2 size-4" /> {t.newConversation.error}
                </>
              )}
              {newLoading === LoadingState.Idle && <>{t.newConversation.confirm}</>}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
