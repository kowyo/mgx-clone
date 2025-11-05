"use client"

import { type ReactNode } from "react"
import { SidebarProvider, SidebarInset } from "@/components/ui/sidebar"
import { ProjectsSidebar } from "@/components/projects-sidebar"
import { ProjectProvider } from "@/contexts/project-context"

interface AppShellProps {
  children: ReactNode
}

export function AppShell({ children }: AppShellProps) {
  return (
    <ProjectProvider>
      <SidebarProvider defaultOpen={false}>
        <ProjectsSidebar />
        <SidebarInset className="overflow-x-hidden">{children}</SidebarInset>
      </SidebarProvider>
    </ProjectProvider>
  )
}
