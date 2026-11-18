"use client"

import { createContext, useContext } from "react"
import { DEFAULT_SOURCE_LABELS, type SourceKey, type SourceLabels, type StructuredSources } from "@lumi/shared-contracts/knowledge"

import { showsSource } from "@/lib/knowledgeSources"

interface SourceLabelsValue {
  labels: SourceLabels
  // The structured sources that are on, or undefined when they couldn't be loaded, so everything shows
  sources?: StructuredSources
}

const SourceLabelsContext = createContext<SourceLabelsValue>({ labels: DEFAULT_SOURCE_LABELS })

// The names and switches of the structured sources for the admin's client components, filled by the admin layout from
// getKnowledgeSources. Server components read getKnowledgeSources or getSourceLabels directly
export function SourceLabelsProvider({ labels, sources, children }: SourceLabelsValue & { children: React.ReactNode }) {
  return <SourceLabelsContext.Provider value={{ labels, sources }}>{children}</SourceLabelsContext.Provider>
}

// How the installation names its structured sources, e.g. labels.teamMembers.plural. Use inSentence mid-sentence
export function useSourceLabels() {
  return useContext(SourceLabelsContext).labels
}

// The structured sources that are on, undefined when they couldn't be loaded (see showsSource)
export function useStructuredSources() {
  return useContext(SourceLabelsContext).sources
}

// Whether a structured source is on, so the admin shows its page and its sections in other records' forms
export function useShowsSource(source: SourceKey) {
  return showsSource(useContext(SourceLabelsContext).sources, source)
}
