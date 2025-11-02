"use client"

import { useEffect, useState } from "react"
import { useSession } from "@/lib/auth-client"
import { useRouter } from "next/navigation"
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
  SidebarTrigger,
} from "@/components/ui/sidebar"
import { Skeleton } from "@/components/ui/skeleton"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { fetchUserProjects, type ProjectListItem } from "@/hooks/generation/services/projects-list-service"
import { Code2, FolderOpen, Loader2, SquarePen } from "lucide-react"
import { cn } from "@/lib/utils"

interface ProjectsSidebarProps {
  onProjectClick?: (projectId: string) => void | Promise<void>
  onNewChat?: () => void
}

export function ProjectsSidebar({ onProjectClick, onNewChat }: ProjectsSidebarProps) {
  const { data: session } = useSession()
  const router = useRouter()
  const [projects, setProjects] = useState<ProjectListItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!session?.user) {
      setLoading(false)
      return
    }

    const loadProjects = async () => {
      try {
        setLoading(true)
        setError(null)
        const data = await fetchUserProjects(session)
        setProjects(data)
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load projects")
        console.error("Failed to fetch projects:", err)
      } finally {
        setLoading(false)
      }
    }

    void loadProjects()
  }, [session])

  const formatDate = (dateString: string) => {
    const date = new Date(dateString)
    return date.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: date.getFullYear() !== new Date().getFullYear() ? "numeric" : undefined,
    })
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case "ready":
        return "bg-green-500/10 text-green-700 dark:text-green-300 border-green-200/40"
      case "pending":
        return "bg-yellow-500/10 text-yellow-700 dark:text-yellow-300 border-yellow-200/40"
      case "error":
        return "bg-red-500/10 text-red-700 dark:text-red-300 border-red-200/40"
      default:
        return "bg-muted text-muted-foreground"
    }
  }

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader className="p-0">
        <div className="flex items-center gap-2 px-4 h-12 group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:px-2">
          <SidebarTrigger className="size-6 group-data-[collapsible=icon]:size-8 group-data-[collapsible=icon]:rounded-lg" />
          <div className="flex flex-col gap-0.5 leading-none group-data-[collapsible=icon]:hidden">
            <span className="font-semibold text-sm">My Projects</span>
            <span className="text-xs text-muted-foreground">
              {projects.length} project{projects.length !== 1 ? "s" : ""}
            </span>
          </div>
        </div>
        <div className="px-4 pb-2 group-data-[collapsible=icon]:px-2 group-data-[collapsible=icon]:pb-2">
          <Button
            variant="ghost"
            className="w-full h-auto py-2 justify-start gap-2 px-0 group-data-[collapsible=icon]:w-auto group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:size-8 group-data-[collapsible=icon]:rounded-lg group-data-[collapsible=icon]:py-0 group-data-[collapsible=icon]:px-0"
            onClick={() => {
              onNewChat?.()
              router.push("/")
            }}
            title="New Chat"
          >
            <div className="flex items-center justify-center size-6 shrink-0 group-data-[collapsible=icon]:size-8">
              <SquarePen className="h-4 w-4 shrink-0" />
            </div>
            <span className="text-sm font-medium group-data-[collapsible=icon]:hidden">New Chat</span>
          </Button>
        </div>
      </SidebarHeader>
      <SidebarContent className="group-data-[collapsible=icon]:hidden">
        {!session?.user ? (
          <SidebarGroup>
            <SidebarGroupContent>
              <div className="flex flex-col items-center justify-center p-8 text-center">
                <FolderOpen className="mb-3 h-8 w-8 text-muted-foreground" />
                <p className="text-sm font-medium text-foreground">Sign in to view projects</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Your projects will appear here once you sign in.
                </p>
              </div>
            </SidebarGroupContent>
          </SidebarGroup>
        ) : loading ? (
          <SidebarGroup>
            <SidebarGroupContent>
              <div className="space-y-2 p-2">
                {[1, 2, 3].map((i) => (
                  <Skeleton key={i} className="h-16 w-full" />
                ))}
              </div>
            </SidebarGroupContent>
          </SidebarGroup>
        ) : error ? (
          <SidebarGroup>
            <SidebarGroupContent>
              <div className="flex flex-col items-center justify-center p-8 text-center">
                <Code2 className="mb-3 h-8 w-8 text-destructive" />
                <p className="text-sm font-medium text-foreground">Error loading projects</p>
                <p className="mt-1 text-xs text-muted-foreground">{error}</p>
              </div>
            </SidebarGroupContent>
          </SidebarGroup>
        ) : projects.length === 0 ? (
          <SidebarGroup>
            <SidebarGroupContent>
              <div className="flex flex-col items-center justify-center p-8 text-center">
                <FolderOpen className="mb-3 h-8 w-8 text-muted-foreground" />
                <p className="text-sm font-medium text-foreground">No projects yet</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Create your first project to see it here.
                </p>
              </div>
            </SidebarGroupContent>
          </SidebarGroup>
        ) : (
          <SidebarGroup>
            <SidebarGroupLabel>Projects</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {projects.map((project) => (
                  <SidebarMenuItem key={project.id}>
                    <SidebarMenuButton
                      tooltip={project.prompt}
                      className="h-auto py-2.5 px-2"
                      onClick={() => {
                        if (onProjectClick) {
                          void onProjectClick(project.id)
                        }
                      }}
                    >
                      <div className="flex flex-col gap-1.5 w-full">
                        <div className="flex items-start justify-between gap-2">
                            <p className="text-sm font-medium leading-tight line-clamp-2 flex-1">  
                            {project.prompt}  
                            </p>
                          <Badge
                            variant="outline"
                            className={cn(
                              "shrink-0 text-[10px] px-1.5 py-0 h-4 border",
                              getStatusColor(project.status),
                            )}
                          >
                            {project.status === "pending" && (
                              <Loader2 className="h-2.5 w-2.5 animate-spin mr-1" />
                            )}
                            {project.status}
                          </Badge>
                        </div>
                        <div className="flex items-center gap-2 text-xs text-muted-foreground">
                          <span>{formatDate(project.created_at)}</span>
                        </div>
                      </div>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        )}
      </SidebarContent>
      <SidebarRail />
    </Sidebar>
  )
}

