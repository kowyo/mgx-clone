"use client"

import { createContext, useContext, type ReactNode } from "react"
import {
  useGenerationSession,
  type UseGenerationSessionReturn,
} from "@/hooks/use-generation-session"

type ProjectContextValue = UseGenerationSessionReturn

const ProjectContext = createContext<ProjectContextValue | null>(null)

export function ProjectProvider({ children }: { children: ReactNode }) {
  const session = useGenerationSession()

  return (
    <ProjectContext.Provider value={session}>
      {children}
    </ProjectContext.Provider>
  )
}

export function useProjectContext() {
  const context = useContext(ProjectContext)
  if (!context) {
    throw new Error("useProjectContext must be used within a ProjectProvider")
  }
  return context
}
