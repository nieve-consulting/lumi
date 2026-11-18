"use client"

import { createContext, useContext } from "react"

// Whether the team members list offers each one's resume (Settings → Resumes), read on the server (see lib/resume.ts)
export const ResumesContext = createContext(false)

export const useResumes = () => useContext(ResumesContext)
