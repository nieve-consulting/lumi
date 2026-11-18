"use client"

import { createContext, useContext, useState, type ReactNode } from "react"
import { createStore, useStore, type StoreApi } from "zustand"

// A records list's pending deletion: the row whose delete dialog is open, shared by its row actions and its delete modal
export type DeleteStore<T> = {
  itemToDelete: T | null
  // Opens the delete dialog for the item, or closes it without one
  setItemToDelete: (item?: T) => void
}

// A provider for one records list and the hook its components read the store with, e.g. for clients
// `createDeleteStore<Client>("Client")`
export function createDeleteStore<T>(name: string) {
  const Context = createContext<StoreApi<DeleteStore<T>> | null>(null)

  function Provider({ children }: { children: ReactNode }) {
    const [store] = useState(() =>
      createStore<DeleteStore<T>>()((set) => ({
        itemToDelete: null,
        setItemToDelete: (item) => set({ itemToDelete: item ?? null }),
      }))
    )

    return <Context.Provider value={store}>{children}</Context.Provider>
  }

  function useDeleteStore<S>(selector: (store: DeleteStore<T>) => S): S {
    const store = useContext(Context)
    if (!store) throw new Error(`use${name}Store must be used within ${name}StoreProvider`)
    return useStore(store, selector)
  }

  return { Provider, useDeleteStore }
}
