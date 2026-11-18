"use client"

import { createContext, useContext, useState, type ReactNode } from "react"
import type { Capability } from "@/generated/graphql"
import { DEFAULT_LANGUAGE, type Language } from "@lumi/shared-contracts/language"
import { createStore, useStore, type StoreApi } from "zustand"

type CapabilityState = {
  itemToDelete: Capability | null
  itemForForm: Capability | "new" | null
  // Language the form modal opens in, e.g. from a translation status in the list. New capabilities are created in English
  languageForForm: Language
}

type CapabilityActions = {
  setItemToDelete: (capability?: Capability) => void
  setItemForForm: (capability: Capability | "new" | null, language?: Language) => void
}

const defaultInitState: CapabilityState = {
  itemToDelete: null,
  itemForForm: null,
  languageForForm: DEFAULT_LANGUAGE,
}

const initProjectStore = (): CapabilityState => {
  return defaultInitState
}

type CapabilityStore = CapabilityState & CapabilityActions

const createProjectStore = (initState: CapabilityState = defaultInitState) => {
  return createStore<CapabilityStore>()((set) => ({
    ...initState,
    setItemToDelete: (capability) => set(() => ({ itemToDelete: capability })),
    setItemForForm: (capability, language = DEFAULT_LANGUAGE) =>
      set(() => ({
        itemForForm: capability,
        languageForForm: capability === "new" ? DEFAULT_LANGUAGE : language,
      })),
  }))
}

const CapabilityStoreContext = createContext<StoreApi<CapabilityStore> | null>(null)

interface ProjectStoreProviderProps {
  children: ReactNode
}

export const CapabilityStoreProvider = ({ children }: ProjectStoreProviderProps) => {
  const [store] = useState<StoreApi<CapabilityStore>>(() => createProjectStore(initProjectStore()))

  return <CapabilityStoreContext.Provider value={store}>{children}</CapabilityStoreContext.Provider>
}

export const useCapabilityStore = <T,>(selector: (store: CapabilityStore) => T): T => {
  const capabilityStoreContext = useContext(CapabilityStoreContext)

  if (!capabilityStoreContext) {
    throw new Error(`usePCapabilityStore must be use within CapabilityStoreProvider`)
  }

  return useStore(capabilityStoreContext, selector)
}
