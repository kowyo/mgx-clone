"use client"

import { useEffect, useState } from "react"
import { useSession } from "@/lib/auth-client"
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarTrigger,
} from "@/components/ui/sidebar"
import { Skeleton } from "@/components/ui/skeleton"
import {
  fetchUserProjects,
  type ProjectListItem,
} from "@/hooks/generation/services/projects-list-service"
import { FolderOpen, SquarePen } from "lucide-react"
import { useProjectContext } from "@/contexts/project-context"

export function ProjectsSidebar() {
  const { loadProject, resetForNewChat } = useProjectContext()
  const { data: session } = useSession()
  const [projects, setProjects] = useState<ProjectListItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!session?.user) {
      setLoading(false)
      return
    }

    const load = async () => {
      try {
        setLoading(true)
        setError(null)
        const data = await fetchUserProjects(session)
        setProjects(data)
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load projects")
      } finally {
        setLoading(false)
      }
    }

    void load()
  }, [session])

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader>
        <SidebarTrigger className="size-8" />
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton onClick={resetForNewChat}>
              <SquarePen />
              <span>New chat</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>
      <SidebarContent className="group-data-[collapsible=icon]:hidden">
        <SidebarGroup>
          <SidebarGroupLabel>Projects</SidebarGroupLabel>
          <SidebarGroupContent>
            {!session?.user ? (
              <div className="flex flex-col items-center justify-center p-8 text-center">
                <FolderOpen className="mb-3 h-8 w-8 text-muted-foreground" />
                <p className="text-sm font-medium text-foreground">
                  Sign in to view projects
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Your projects will appear here once you sign in.
                </p>
              </div>
            ) : loading ? (
              <div className="space-y-2 p-2">
                {[1, 2, 3].map((i) => (
                  <Skeleton key={i} className="h-10 w-full" />
                ))}
              </div>
            ) : error ? (
              <div className="flex flex-col items-center justify-center p-8 text-center">
                <p className="text-sm font-medium text-foreground">
                  Error loading projects
                </p>
                <p className="mt-1 text-xs text-muted-foreground">{error}</p>
              </div>
            ) : projects.length === 0 ? (
              <div className="flex flex-col items-center justify-center p-8 text-center">
                <FolderOpen className="mb-3 h-8 w-8 text-muted-foreground" />
                <p className="text-sm font-medium text-foreground">
                  No projects yet
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Create your first project to see it here.
                </p>
              </div>
            ) : (
              <SidebarMenu>
                {projects.map((project) => (
                  <SidebarMenuItem key={project.id}>
                    <SidebarMenuButton onClick={() => loadProject(project.id)}>
                      <span className="truncate">{project.prompt}</span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            )}
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter />
    </Sidebar>
  )
}
