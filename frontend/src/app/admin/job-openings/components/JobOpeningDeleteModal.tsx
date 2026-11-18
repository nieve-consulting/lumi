import { useState } from "react"
import { useRouter } from "next/navigation"

import { Button } from "@/components/ui/button"
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { LoadingButton, LoadingButtonState } from "@/components/ui/loading-button"
import { useToast } from "@/components/ui/use-toast"

import { deleteJobOpening } from "../actions"
import { useJobOpeningStore } from "./table/storeProvider"

export default function JobOpeningDeleteModal() {
  const { itemToDelete, setItemToDelete } = useJobOpeningStore((state) => state)
  const [loading, setLoading] = useState<LoadingButtonState>(LoadingButtonState.Idle)
  const { toast } = useToast()

  const router = useRouter()

  const isOpen = itemToDelete != null

  function handleOpenChange(open: boolean) {
    if (!open) setItemToDelete()
  }

  async function handleDelete() {
    if (!itemToDelete) return
    setLoading(LoadingButtonState.Loading)
    try {
      if (!(await deleteJobOpening(itemToDelete.id))) throw new Error("Not deleted")
      setItemToDelete()
      router.refresh()
    } catch {
      toast({ variant: "destructive", title: "Error", description: `${itemToDelete.title} couldn't be deleted. Try again in a moment.` })
    } finally {
      setLoading(LoadingButtonState.Idle)
    }
  }

  return (
    <Dialog open={isOpen} onOpenChange={handleOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Are you absolutely sure?</DialogTitle>
          <DialogDescription>
            This action cannot be undone and will permanently delete {itemToDelete?.title} in every language. To take it down but keep it, unpublish
            it instead.
          </DialogDescription>
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
