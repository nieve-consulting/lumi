import { useState } from "react"
import { useRouter } from "next/navigation"

import { Button } from "@/components/ui/button"
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { LoadingButton, LoadingButtonState } from "@/components/ui/loading-button"

import { deleteThread } from "../actions"
import { useThreadStore } from "./table/storeProvider"

export default function ThreadDeleteModal() {
  const { itemToDelete, setItemToDelete } = useThreadStore((state) => state)
  const [loading, setLoading] = useState<LoadingButtonState>(LoadingButtonState.Idle)

  const router = useRouter()

  const isOpen = itemToDelete != null

  function handleOpenChange(open: boolean) {
    if (!open) setItemToDelete()
  }

  async function handleDelete() {
    if (itemToDelete) {
      setLoading(LoadingButtonState.Loading)
      const result = await deleteThread(itemToDelete.id)
      if (result) {
        setItemToDelete()
        router.refresh()
      } else {
        setLoading(LoadingButtonState.Idle)
      }
      setLoading(LoadingButtonState.Idle)
    }
  }

  return (
    <Dialog open={isOpen} onOpenChange={handleOpenChange}>
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
  )
}
