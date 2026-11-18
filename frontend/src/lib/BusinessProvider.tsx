"use client"

import { createContext, useContext, useMemo } from "react"
import type { PublicBusinessConfig } from "@lumi/shared-contracts/business"

import { toBusiness, UNSET_BUSINESS, type Business } from "@/lib/businessSettings"
import type { StarterSources } from "@/lib/chatSources"

export interface ChatBusiness extends Business {
  // Whether the chat links team members' resumes (Settings → Resumes)
  resumes: boolean
  // The structured sources the built-in starters may point to (lib/chatSources.ts)
  starterSources: StarterSources
}

// Every built-in starter, where the chat doesn't say which sources are on
const ALL_STARTER_SOURCES: StarterSources = { projects: true, jobOpenings: true }

// Without a provider, e.g. in an admin page, chat components show Lumi's own name and picture, and no resume links
const BusinessContext = createContext<ChatBusiness>({ ...toBusiness(UNSET_BUSINESS), resumes: false, starterSources: ALL_STARTER_SOURCES })

interface IProps {
  // The business's public settings, read on the server (see lib/business.ts)
  config: PublicBusinessConfig
  // Whether resumes are on, read on the server (see lib/resume.ts): cards of older conversations still name a resume's URL
  resumes: boolean
  // Which structured sources are on, for the built-in starters; all of them when not given
  starterSources?: StarterSources
  children: React.ReactNode
}

// Gives the chat the business it represents: its names, pictures, links and starters, and whether it offers resumes
export function BusinessProvider({ config, resumes, starterSources = ALL_STARTER_SOURCES, children }: IProps) {
  const value = useMemo(() => ({ ...toBusiness(config), resumes, starterSources }), [config, resumes, starterSources])
  return <BusinessContext value={value}>{children}</BusinessContext>
}

export function useBusiness() {
  return useContext(BusinessContext)
}
