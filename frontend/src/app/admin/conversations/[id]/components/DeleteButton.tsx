import { useState } from "react"
import { Trash } from "lucide-react"
import { useRouter } from "nextjs-toploader/app"

import { Button } from "@/components/ui/button"
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { LoadingButton, LoadingButtonState } from "@/components/ui/loading-button"

import { conversationListHref } from "../../components/table/urlState"

interface IProps {
  deleteThread: () => Promise<void>
}

export default function DeleteButton({ deleteThread }: IProps) {
  const router = useRouter()

  const [open, setDeleteDlgOpen] = useState(false)
  const [loading, setLoading] = useState<LoadingButtonState>(LoadingButtonState.Idle)

  async function handleDelete() {
    setLoading(LoadingButtonState.Loading)
    await deleteThread()
    // Back to the list as it was searched and filtered, replacing the deleted conversation so Back can't return to it
    router.replace(conversationListHref())
  }

  return (
    <>
      <Button variant="destructive" className="px-2 py-1" onClick={() => setDeleteDlgOpen(true)}>
        <Trash size={18} className="mr-2" /> Delete
      </Button>
      <Dialog open={open} onOpenChange={setDeleteDlgOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Are you absolutely sure?</DialogTitle>
            <DialogDescription>This action cannot be undone and will permanently delete the conversation.</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="secondary">
                Cancel
              </Button>
            </DialogClose>
            <LoadingButton state={loading} variant="destructive" text="Delete" loadingText="Deleting..." onClick={handleDelete} />
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
