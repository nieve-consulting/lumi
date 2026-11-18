import { useState } from "react"
import { useRouter } from "next/navigation"

import { Button } from "@/components/ui/button"
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { LoadingButton, LoadingButtonState } from "@/components/ui/loading-button"
import { useToast } from "@/components/ui/use-toast"

import { deleteProject } from "../actions"
import { useProjectStore } from "./table/storeProvider"

export default function ProjectDeleteModal() {
  const { itemToDelete, setItemToDelete } = useProjectStore((state) => state)
  const [loading, setLoading] = useState<LoadingButtonState>(LoadingButtonState.Idle)

  const router = useRouter()
  const { toast } = useToast()

  const isOpen = itemToDelete != null

  function handleOpenChange(open: boolean) {
    if (!open) setItemToDelete()
  }

  async function handleDelete() {
    if (!itemToDelete) return

    setLoading(LoadingButtonState.Loading)
    try {
      if (await deleteProject(itemToDelete.id)) {
        setItemToDelete()
        router.refresh()
      } else {
        toast({ variant: "destructive", title: `${itemToDelete.name} couldn't be deleted`, description: "Try again in a moment." })
      }
    } catch {
      // The API refused the delete, e.g. because someone else already deleted it: the refreshed list shows what is left
      setItemToDelete()
      router.refresh()
      toast({
        variant: "destructive",
        title: `${itemToDelete.name} couldn't be deleted`,
        description: "It may have been deleted already. The list has been refreshed.",
      })
    } finally {
      setLoading(LoadingButtonState.Idle)
    }
  }

  return (
    <Dialog open={isOpen} onOpenChange={handleOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Are you absolutely sure?</DialogTitle>
          <DialogDescription>This action cannot be undone and will permanently delete {itemToDelete?.name}.</DialogDescription>
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
