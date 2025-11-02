import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useSession } from "@/lib/auth-client"
import type {
  LogEntry,
  ConversationMessage,
  ViewerFile,
  UseGenerationSessionReturn,
  InlineGeneratedFile,
} from "./generation/types"
import { beginConversationTurn, updateMessage } from "./generation/utils/conversation"
import { toAbsolutePreviewUrl, refreshPreviewUrl } from "./generation/utils/preview"
import { getApiBaseUrl, getBackendOrigin, getWsBaseUrl, getAuthHeaders } from "./generation/utils/api"
import { createWebSocket } from "./generation/services/websocket"
import { fetchProjectFiles } from "./generation/services/file-service"
import { startPolling, stopPolling } from "./generation/services/project-service"
import type { ProjectServiceHandlers } from "./generation/services/project-service"
import type { FileServiceHandlers } from "./generation/services/file-service"
import type { WebSocketMessageHandler } from "./generation/services/websocket"

// Re-export types for backward compatibility
export type { LogEntry, ConversationMessage, ViewerFile, UseGenerationSessionReturn }

export function useGenerationSession(): UseGenerationSessionReturn {
  const { data: session } = useSession()
  const [prompt, setPromptState] = useState("")
  const [isGenerating, setIsGenerating] = useState(false)
  const [logs, setLogs] = useState<LogEntry[]>([])
  const [messages, setMessages] = useState<ConversationMessage[]>([])
  const [activeTab, setActiveTabState] = useState("code")
  const [previewUrl, setPreviewUrl] = useState("")
  const [projectId, setProjectId] = useState<string | null>(null)
  const [projectStatus, setProjectStatus] = useState<string | null>(null)
  const [fileOrder, setFileOrder] = useState<string[]>([])
  const [fileContents, setFileContents] = useState<Record<string, string>>({})
  const [selectedFile, setSelectedFileState] = useState<string | null>(null)

  const apiBaseUrl = useMemo(() => getApiBaseUrl(), [])
  const wsBaseEnv = useMemo(() => getWsBaseUrl(), [])
  const backendOrigin = useMemo(() => getBackendOrigin(apiBaseUrl), [apiBaseUrl])

  // Refs
  const pollingRef = useRef<number | null>(null)
  const wsRef = useRef<WebSocket | null>(null)
  const metadataRef = useRef<Record<string, string>>({})
  const fileContentsRef = useRef<Record<string, string>>({})
  const pendingFetchesRef = useRef<Set<string>>(new Set())
  const statusErrorLoggedRef = useRef(false)
  const filesErrorLoggedRef = useRef(false)
  const activeAssistantMessageIdRef = useRef<string | null>(null)
  const basePreviewUrlRef = useRef<string>("")
  const previewUrlWithTokenRef = useRef<string>("")
  const projectIdRef = useRef<string | null>(null)

  // Sync refs with state
  useEffect(() => {
    fileContentsRef.current = fileContents
  }, [fileContents])

  useEffect(() => {
    projectIdRef.current = projectId
  }, [projectId])

  // Setters
  const setPrompt = useCallback((value: string) => {
    setPromptState(value)
  }, [])

  const setActiveTab = useCallback((value: string) => {
    setActiveTabState(value)
  }, [])

  const setSelectedFile = useCallback((path: string | null) => {
    setSelectedFileState(path)
  }, [])

  const addLog = useCallback((type: LogEntry["type"], message: string) => {
    setLogs((prev) => [...prev, { type, message }])
  }, [])

  // Conversation management
  const beginTurn = useCallback(
    (userContent: string, assistantIntro = "Working on your app...") => {
      const result = beginConversationTurn(userContent, assistantIntro)
      if (!result) {
        return null
      }
      const { userMessage, assistantMessage } = result
      setMessages((previous) => [...previous, userMessage, assistantMessage])
      activeAssistantMessageIdRef.current = assistantMessage.id
      return assistantMessage.id
    },
    [],
  )

  const updateAssistantMessage = useCallback((id: string | null, patch: Partial<ConversationMessage> | ((message: ConversationMessage) => Partial<ConversationMessage>)) => {
    if (!id) {
      return
    }
    setMessages((previous) =>
      previous.map((message) => (message.id === id ? updateMessage(message, patch) : message)),
    )
  }, [])

  const updateActiveAssistantMessage = useCallback(
    (patch: Partial<ConversationMessage> | ((message: ConversationMessage) => Partial<ConversationMessage>)) => {
      updateAssistantMessage(activeAssistantMessageIdRef.current, patch)
    },
    [updateAssistantMessage],
  )

  // Preview URL management
  const updatePreview = useCallback(
    async (raw?: string | null) => {
      if (!raw) {
        basePreviewUrlRef.current = ""
        previewUrlWithTokenRef.current = ""
        setPreviewUrl("")
        return
      }
      try {
        const url = await toAbsolutePreviewUrl(raw, backendOrigin, session, basePreviewUrlRef, previewUrlWithTokenRef)
        setPreviewUrl(url)
      } catch (error) {
        console.error("Error updating preview URL:", error)
        // Fallback: try without token
        try {
          let url: URL
          if (raw.startsWith("http://") || raw.startsWith("https://")) {
            url = new URL(raw)
          } else if (backendOrigin) {
            url = new URL(raw, backendOrigin)
          } else {
            setPreviewUrl(raw)
            return
          }
          setPreviewUrl(url.toString())
        } catch {
          setPreviewUrl(raw)
        }
      }
    },
    [backendOrigin, session],
  )

  // WebSocket handlers
  const wsHandlers: WebSocketMessageHandler = useMemo(
    () => ({
      onStatusSnapshot: (status, previewUrl) => {
        if (status) {
          setProjectStatus(status)
        }
        if (previewUrl) {
          updatePreview(previewUrl)
        }
      },
      onStatusUpdated: (status) => {
        setProjectStatus(status)
        addLog(status === "ready" ? "success" : "info", `Status changed to ${status}`)
        if (status === "ready") {
          setActiveTab("preview")
        }
        updateActiveAssistantMessage(() => ({
          content:
            status === "ready"
              ? "Your app is ready. Open the preview to explore the result."
              : `Status updated: ${status}`,
          status: status === "failed" ? "error" : status === "ready" ? "complete" : "pending",
        }))
      },
      onLogAppended: (message) => {
        addLog("info", message)
      },
      onPreviewReady: (preview) => {
        updatePreview(preview)
        addLog("success", "Preview ready")
        setActiveTab("preview")
        updateActiveAssistantMessage(() => ({
          content: "Preview is ready in the right panel.",
          status: "complete",
        }))
      },
      onError: (message) => {
        addLog("error", message)
        updateActiveAssistantMessage(() => ({ content: message, status: "error" }))
        setProjectStatus("failed")
      },
      onProjectCreated: (message) => {
        addLog("info", message)
        updateActiveAssistantMessage((msg) => ({
          content: `${msg.content}\n${message}`.trim(),
        }))
      },
      addLog,
      updateActiveAssistantMessage,
      setProjectStatus,
      setActiveTab,
      updatePreview,
    }),
    [addLog, updateActiveAssistantMessage, setProjectStatus, setActiveTab, updatePreview],
  )

  // WebSocket management
  const closeWebSocket = useCallback(() => {
    if (wsRef.current) {
      wsRef.current.close()
      wsRef.current = null
    }
  }, [])

  const startWebSocket = useCallback(
    (id: string) => {
      closeWebSocket()
      const socket = createWebSocket(id, wsBaseEnv, backendOrigin, wsHandlers)
      if (socket) {
        wsRef.current = socket
      }
    },
    [closeWebSocket, wsBaseEnv, backendOrigin, wsHandlers],
  )

  // File service handlers - React state setters are stable, so we can use them directly
  // Note: setFileOrder and setFileContents are stable and don't need to be in deps
  const fileServiceHandlers: FileServiceHandlers = useMemo(
    () => ({
      addLog,
      setFileOrder: (order: string[]) => {
        setFileOrder(order)
      },
      setFileContents: (updater: (prev: Record<string, string>) => Record<string, string>) => {
        setFileContents(updater)
      },
      getFileContents: () => fileContentsRef.current,
      getApiBaseUrl: () => apiBaseUrl,
      getAuthHeaders: async () => getAuthHeaders(session),
    }),
    [addLog, apiBaseUrl, session],
  )

  const fetchProjectFilesHandler = useCallback(
    async () => {
      const currentProjectId = projectIdRef.current
      if (!currentProjectId) {
        return
      }
      await fetchProjectFiles(
        currentProjectId,
        fileServiceHandlers,
        metadataRef,
        fileContentsRef,
        pendingFetchesRef,
        filesErrorLoggedRef,
      )
    },
    [fileServiceHandlers],
  )

  // Project service handlers
  const projectServiceHandlers: ProjectServiceHandlers = useMemo(
    () => ({
      addLog,
      setProjectStatus,
      setActiveTab,
      updatePreview,
      getApiBaseUrl: () => apiBaseUrl,
      getAuthHeaders: async () => getAuthHeaders(session),
    }),
    [addLog, apiBaseUrl, session, setActiveTab, updatePreview],
  )

  // Polling management
  useEffect(() => {
    return () => {
      stopPolling(pollingRef)
      closeWebSocket()
    }
  }, [closeWebSocket])

  const startPollingHandler = useCallback(
    (id: string) => {
      startPolling(id, projectServiceHandlers, { fetchProjectFiles: fetchProjectFilesHandler }, statusErrorLoggedRef, pollingRef)
    },
    [projectServiceHandlers, fetchProjectFilesHandler],
  )

  // Reset for new generation
  const resetForNewGeneration = useCallback(() => {
    stopPolling(pollingRef)
    closeWebSocket()
    metadataRef.current = {}
    fileContentsRef.current = {}
    pendingFetchesRef.current.clear()
    statusErrorLoggedRef.current = false
    filesErrorLoggedRef.current = false
    activeAssistantMessageIdRef.current = null
    basePreviewUrlRef.current = ""
    previewUrlWithTokenRef.current = ""
    projectIdRef.current = null
    setProjectId(null)
    setProjectStatus(null)
    setFileOrder([])
    setFileContents({})
    setSelectedFile(null)
    setPreviewUrl("")
  }, [closeWebSocket])

  // Generation trigger
  const triggerGeneration = useCallback(
    async (rawPrompt: string, options?: { clearPrompt?: boolean }) => {
      const trimmedPrompt = rawPrompt.trim()
      if (!trimmedPrompt) {
        addLog("error", "Please enter a prompt")
        return
      }

      resetForNewGeneration()

      const assistantMessageId = beginTurn(trimmedPrompt)
      if (options?.clearPrompt ?? true) {
        setPromptState("")
      }

      setIsGenerating(true)
      setLogs([])
      addLog("info", "Starting generation...")
      addLog("info", `Prompt: ${trimmedPrompt}`)

      try {
        const headers = await getAuthHeaders(session)
        const response = await fetch(`${apiBaseUrl}/generate`, {
          method: "POST",
          credentials: "include",
          headers,
          body: JSON.stringify({ prompt: trimmedPrompt }),
        })

        if (!response.ok) {
          throw new Error(`Generation failed (status ${response.status})`)
        }

        const data = await response.json()
        if (typeof data.project_id === "string") {
          projectIdRef.current = data.project_id
          setProjectId(data.project_id)
          if (typeof data.status === "string") {
            setProjectStatus(data.status)
          }
          addLog("success", `Generation request accepted (project ${data.project_id})`)
          updateAssistantMessage(assistantMessageId, {
            content: `Project ${data.project_id} accepted. I will update you as soon as it is ready.`,
            status: "pending",
            projectId: data.project_id,
          })
          startWebSocket(data.project_id)
          startPollingHandler(data.project_id)
          setActiveTab("code")
          return
        }

        const inlineFiles: InlineGeneratedFile[] = Array.isArray(data.files) ? data.files : []
        if (inlineFiles.length > 0) {
          const nextOrder = inlineFiles
            .map((file) => file?.path)
            .filter((path): path is string => typeof path === "string")
          const uniquePaths = Array.from(new Set(nextOrder))
          const contents: Record<string, string> = {}
          for (const file of inlineFiles) {
            if (file?.path && typeof file.content === "string") {
              contents[file.path] = file.content
            }
          }
          metadataRef.current = {}
          fileContentsRef.current = contents
          setFileOrder(uniquePaths)
          setFileContents(contents)
          setSelectedFile(uniquePaths[0] ?? null)
          addLog("success", `Generated ${inlineFiles.length} files`)
          if (typeof data.preview_url === "string" && data.preview_url.trim()) {
            updatePreview(data.preview_url)
            addLog("success", "Preview server started")
            setActiveTab("preview")
          }
          const summarySegments: string[] = []
          if (inlineFiles.length > 0) {
            summarySegments.push(`Generated ${inlineFiles.length} file${inlineFiles.length === 1 ? "" : "s"}.`)
          }
          if (typeof data.preview_url === "string" && data.preview_url.trim()) {
            summarySegments.push("Preview is ready in the right panel.")
          }
          updateAssistantMessage(assistantMessageId, {
            content: summarySegments.join(" ") || "Generation complete.",
            status: "complete",
          })
          return
        }

        throw new Error("Unexpected response from backend")
      } catch (error) {
        addLog("error", error instanceof Error ? error.message : "An error occurred")
        updateAssistantMessage(assistantMessageId, {
          content: error instanceof Error ? error.message : "An unexpected error occurred.",
          status: "error",
        })
      } finally {
        setIsGenerating(false)
      }
    },
    [
      addLog,
      apiBaseUrl,
      beginTurn,
      resetForNewGeneration,
      session,
      startPollingHandler,
      startWebSocket,
      updateAssistantMessage,
      updatePreview,
    ],
  )

  const handleGenerate = useCallback(async () => {
    await triggerGeneration(prompt, { clearPrompt: true })
  }, [prompt, triggerGeneration])

  const handleRefreshPreview = useCallback(() => {
    if (!previewUrl) {
      return
    }
    addLog("info", "Refreshing preview...")
    const refreshed = refreshPreviewUrl(previewUrl)
    setPreviewUrl(refreshed)
    addLog("success", "Preview refreshed")
  }, [addLog, previewUrl])

  // Load an existing project
  const loadProject = useCallback(
    async (id: string) => {
      resetForNewGeneration()
      
      projectIdRef.current = id
      setProjectId(id)
      
      addLog("info", `Loading project ${id}...`)
      
      try {
        // Create a user message for context
        const userMessage: ConversationMessage = {
          id: `load-${id}-${Date.now()}`,
          role: "user",
          content: `Opening project ${id}`,
          status: "complete",
          createdAt: Date.now(),
          updatedAt: Date.now(),
          projectId: id,
        }
        
        const assistantMessage: ConversationMessage = {
          id: `load-assistant-${id}-${Date.now()}`,
          role: "assistant",
          content: "Loading project files and status...",
          status: "pending",
          createdAt: Date.now(),
          updatedAt: Date.now(),
          projectId: id,
        }
        
        setMessages([userMessage, assistantMessage])
        activeAssistantMessageIdRef.current = assistantMessage.id
        
        // Fetch project status
        const headers = await getAuthHeaders(session)
        const statusResponse = await fetch(`${apiBaseUrl}/projects/${id}/status`, {
          cache: "no-store",
          credentials: "include",
          headers,
        })
        
        if (!statusResponse.ok) {
          throw new Error(`Failed to load project: ${statusResponse.status}`)
        }
        
        const statusData = await statusResponse.json()
        
        if (typeof statusData.status === "string") {
          setProjectStatus(statusData.status)
        }
        
        if (typeof statusData.preview_url === "string" && statusData.preview_url) {
          await updatePreview(statusData.preview_url)
        }
        
        // Start WebSocket connection
        startWebSocket(id)
        
        // Start polling for updates
        startPollingHandler(id)
        
        // Fetch files immediately
        await fetchProjectFilesHandler()
        
        // Set appropriate tab
        if (statusData.preview_url) {
          setActiveTab("preview")
        } else {
          setActiveTab("code")
        }
        
        updateAssistantMessage(assistantMessage.id, {
          content: statusData.status === "ready" 
            ? "Project loaded. You can view the code and preview."
            : `Project loaded. Status: ${statusData.status}`,
          status: statusData.status === "ready" ? "complete" : "pending",
        })
        
        addLog("success", `Project ${id} loaded`)
      } catch (error) {
        addLog("error", error instanceof Error ? error.message : "Failed to load project")
        updateAssistantMessage(activeAssistantMessageIdRef.current, {
          content: error instanceof Error ? error.message : "Failed to load project",
          status: "error",
        })
      }
    },
    [
      addLog,
      apiBaseUrl,
      fetchProjectFilesHandler,
      resetForNewGeneration,
      session,
      startPollingHandler,
      startWebSocket,
      updateAssistantMessage,
      updatePreview,
      setActiveTab,
    ],
  )

  const filesForViewer = useMemo<ViewerFile[]>(() => {
    const files = fileOrder.map((path) => ({ path, content: fileContents[path] }))
    return files
  }, [fileContents, fileOrder])

  useEffect(() => {
    if (filesForViewer.length === 0) {
      setSelectedFile(null)
      return
    }
    if (!selectedFile || !filesForViewer.some((file) => file.path === selectedFile)) {
      setSelectedFile(filesForViewer[0].path)
    }
  }, [filesForViewer, selectedFile, setSelectedFile])

  const codeViewerLoading = projectId !== null && filesForViewer.length === 0 && projectStatus !== "failed"

  return {
    prompt,
    setPrompt,
    isGenerating,
    logs,
    messages,
    activeTab,
    setActiveTab,
    previewUrl,
    filesForViewer,
    selectedFile,
    setSelectedFile,
    handleGenerate,
    handleRefreshPreview,
    loadProject,
    codeViewerLoading,
  }
}
