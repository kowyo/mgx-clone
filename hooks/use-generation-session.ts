import { useCallback, useEffect, useMemo, useRef, useState } from "react"

export type LogEntry = { type: "info" | "error" | "success"; message: string }
type InlineGeneratedFile = { path?: string; content?: string | null }
type ApiProjectFileEntry = { path?: string; is_dir?: boolean; updated_at?: string | null }

type ViewerFile = { path: string; content?: string }

type ConversationStatus = "pending" | "complete" | "error"
type ConversationRole = "user" | "assistant"

export type ConversationMessage = {
  id: string
  role: ConversationRole
  content: string
  status: ConversationStatus
  createdAt: number
  updatedAt: number
  projectId?: string | null
}

const createMessageId = () => {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID()
  }
  return `msg_${Math.random().toString(36).slice(2, 10)}_${Date.now()}`
}

type UseGenerationSessionReturn = {
  prompt: string
  setPrompt: (value: string) => void
  isGenerating: boolean
  logs: LogEntry[]
  messages: ConversationMessage[]
  activeTab: string
  setActiveTab: (value: string) => void
  previewUrl: string
  filesForViewer: ViewerFile[]
  selectedFile: string | null
  setSelectedFile: (path: string | null) => void
  handleGenerate: () => Promise<void>
  handleRegenerate: () => void
  handleRefreshPreview: () => void
  showRegenerate: boolean
  codeViewerLoading: boolean
}

export function useGenerationSession(): UseGenerationSessionReturn {
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

  const apiBaseUrl = (process.env.NEXT_PUBLIC_BACKEND_URL ?? "http://127.0.0.1:8000/api").replace(/\/$/, "")
  const wsBaseEnv = useMemo(() => {
    const raw = process.env.NEXT_PUBLIC_BACKEND_WS_URL
    return raw ? raw.replace(/\/$/, "") : null
  }, [])

  const backendOrigin = useMemo(() => {
    try {
      const normalized = apiBaseUrl.endsWith("/") ? apiBaseUrl : `${apiBaseUrl}/`
      const url = new URL(normalized)
      return url.origin
    } catch {
      return ""
    }
  }, [apiBaseUrl])

  const pollingRef = useRef<number | null>(null)
  const wsRef = useRef<WebSocket | null>(null)
  const metadataRef = useRef<Record<string, string>>({})
  const fileContentsRef = useRef<Record<string, string>>({})
  const pendingFetchesRef = useRef<Set<string>>(new Set())
  const statusErrorLoggedRef = useRef(false)
  const filesErrorLoggedRef = useRef(false)
  const activeAssistantMessageIdRef = useRef<string | null>(null)
  const lastPromptRef = useRef<string>("")

  useEffect(() => {
    fileContentsRef.current = fileContents
  }, [fileContents])

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

  const beginConversationTurn = useCallback(
    (userContent: string, assistantIntro = "Working on your app...") => {
      const trimmed = userContent.trim()
      if (!trimmed) {
        return null
      }
      const timestamp = Date.now()
      const userMessage: ConversationMessage = {
        id: createMessageId(),
        role: "user",
        content: trimmed,
        status: "complete",
        createdAt: timestamp,
        updatedAt: timestamp,
      }
      const assistantMessage: ConversationMessage = {
        id: createMessageId(),
        role: "assistant",
        content: assistantIntro,
        status: "pending",
        createdAt: timestamp,
        updatedAt: timestamp,
      }
      const assistantId = assistantMessage.id
      setMessages((previous) => [...previous, userMessage, assistantMessage])
      activeAssistantMessageIdRef.current = assistantId
      return assistantId
    },
    [],
  )

  const updateAssistantMessage = useCallback(
    (
      id: string | null,
      next: Partial<ConversationMessage> | ((message: ConversationMessage) => Partial<ConversationMessage>),
    ) => {
      if (!id) {
        return
      }
      setMessages((previous) =>
        previous.map((message) => {
          if (message.id !== id) {
            return message
          }
          const patch = typeof next === "function" ? next(message) : next
          const status: ConversationStatus = patch.status ?? message.status
          return {
            ...message,
            ...patch,
            status,
            updatedAt: Date.now(),
          }
        }),
      )
    },
    [],
  )

  const updateActiveAssistantMessage = useCallback(
    (
      next: Partial<ConversationMessage> | ((message: ConversationMessage) => Partial<ConversationMessage>),
    ) => {
      updateAssistantMessage(activeAssistantMessageIdRef.current, next)
    },
    [updateAssistantMessage],
  )

  const stopPolling = useCallback(() => {
    if (pollingRef.current !== null) {
      window.clearInterval(pollingRef.current)
      pollingRef.current = null
    }
  }, [])

  const closeWebSocket = useCallback(() => {
    if (wsRef.current) {
      wsRef.current.close()
      wsRef.current = null
    }
  }, [])

  useEffect(() => {
    return () => {
      stopPolling()
      closeWebSocket()
    }
  }, [closeWebSocket, stopPolling])

  const toAbsolutePreviewUrl = useCallback(
    (raw: string) => {
      if (!raw) {
        return ""
      }
      try {
        if (raw.startsWith("http://") || raw.startsWith("https://")) {
          return raw
        }
        if (!backendOrigin) {
          return raw
        }
        return new URL(raw, backendOrigin).toString()
      } catch {
        return raw
      }
    },
    [backendOrigin],
  )

  const updatePreview = useCallback(
    (raw?: string | null) => {
      const resolved = raw ? toAbsolutePreviewUrl(raw) : ""
      setPreviewUrl(resolved)
    },
    [toAbsolutePreviewUrl],
  )

  const buildWsUrl = useCallback(
    (id: string) => {
      if (wsBaseEnv) {
        return `${wsBaseEnv}/${id}`
      }
      if (backendOrigin) {
        const originUrl = new URL(backendOrigin)
        const protocol = originUrl.protocol === "https:" ? "wss:" : "ws:"
        return `${protocol}//${originUrl.host}/ws/${id}`
      }
      return `ws://127.0.0.1:8000/ws/${id}`
    },
    [backendOrigin, wsBaseEnv],
  )

  const handleWebSocketMessage = useCallback(
    (raw: string) => {
      try {
        const data = JSON.parse(raw)

        if (data.type === "status_snapshot") {
          const status = data.payload?.status
          if (typeof status === "string") {
            setProjectStatus(status)
          }
          if (typeof data.payload?.preview_url === "string") {
            updatePreview(data.payload.preview_url)
          }
          return
        }

        if (data.type === "status_updated") {
          const status = data.payload?.status ?? data.message
          if (typeof status === "string") {
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
          }
          return
        }

        if (data.type === "log_appended" && typeof data.message === "string") {
          addLog("info", data.message)
          return
        }

        if (data.type === "preview_ready") {
          const preview = data.payload?.preview_url
          if (typeof preview === "string") {
            updatePreview(preview)
            addLog("success", "Preview ready")
            setActiveTab("preview")
            updateActiveAssistantMessage(() => ({
              content: "Preview is ready in the right panel.",
              status: "complete",
            }))
          }
          return
        }

        if (data.type === "error") {
          if (typeof data.message === "string") {
            addLog("error", data.message)
            updateActiveAssistantMessage(() => ({ content: data.message, status: "error" }))
          } else {
            addLog("error", "Generation error")
            updateActiveAssistantMessage(() => ({ content: "Generation error", status: "error" }))
          }
          setProjectStatus("failed")
          return
        }

        if (data.type === "project_created" && typeof data.message === "string") {
          addLog("info", data.message)
          updateActiveAssistantMessage((message) => ({
            content: `${message.content}\n${data.message}`.trim(),
          }))
          return
        }
      } catch (error) {
        addLog(
          "error",
          `Failed to parse stream message: ${error instanceof Error ? error.message : String(error)}`,
        )
      }
    },
    [addLog, updateActiveAssistantMessage, updatePreview],
  )

  const startWebSocket = useCallback(
    (id: string) => {
      try {
        const url = buildWsUrl(id)
        const socket = new WebSocket(url)
        wsRef.current = socket
        socket.onopen = () => addLog("info", "Connected to generation stream")
        socket.onmessage = (event) => handleWebSocketMessage(event.data)
        socket.onerror = () => addLog("error", "WebSocket connection error")
        socket.onclose = (event) => {
          if (event.code !== 1000) {
            addLog("info", `Stream closed (${event.code})`)
          }
          if (wsRef.current === socket) {
            wsRef.current = null
          }
        }
      } catch (error) {
        addLog("error", `Failed to open WebSocket: ${error instanceof Error ? error.message : String(error)}`)
      }
    },
    [addLog, buildWsUrl, handleWebSocketMessage],
  )

  const fetchFileContent = useCallback(
    async (id: string, path: string) => {
      if (pendingFetchesRef.current.has(path)) {
        return
      }
      pendingFetchesRef.current.add(path)
      try {
        const encodedPath = path
          .split("/")
          .map((segment) => encodeURIComponent(segment))
          .join("/")
        const response = await fetch(`${apiBaseUrl}/projects/${id}/files/${encodedPath}`, { cache: "no-store" })
        if (!response.ok) {
          throw new Error(`status ${response.status}`)
        }
        const content = await response.text()
        setFileContents((prev) => ({ ...prev, [path]: content }))
      } catch (error) {
        addLog(
          "error",
          `Failed to fetch file ${path}: ${error instanceof Error ? error.message : String(error)}`,
        )
      } finally {
        pendingFetchesRef.current.delete(path)
      }
    },
    [addLog, apiBaseUrl],
  )

  const fetchProjectFiles = useCallback(
    async (id: string) => {
      try {
        const response = await fetch(`${apiBaseUrl}/projects/${id}/files`, { cache: "no-store" })
        if (!response.ok) {
          if (!filesErrorLoggedRef.current) {
            addLog("error", `Failed to fetch files (status ${response.status})`)
            filesErrorLoggedRef.current = true
          }
          return
        }
        filesErrorLoggedRef.current = false

        const data = await response.json()
        const items: ApiProjectFileEntry[] = Array.isArray(data.files) ? data.files : []
        const fileEntries = items.filter((entry): entry is { path: string; updated_at?: string | null } =>
          !!entry && entry.is_dir === false && typeof entry.path === "string",
        )
        const uniquePaths = Array.from(new Set(fileEntries.map((entry) => entry.path))).sort()

        setFileOrder((prev) => {
          if (prev.length === uniquePaths.length && prev.every((value, index) => value === uniquePaths[index])) {
            return prev
          }
          return uniquePaths
        })

        setFileContents((prev) => {
          const next: Record<string, string> = {}
          for (const path of uniquePaths) {
            if (prev[path] !== undefined) {
              next[path] = prev[path]
            }
          }
          return next
        })

        const nextMetadata: Record<string, string> = {}
        for (const entry of fileEntries) {
          nextMetadata[entry.path] = typeof entry.updated_at === "string" ? entry.updated_at : ""
        }
        const previousMetadata = metadataRef.current
        metadataRef.current = nextMetadata

        for (const entry of fileEntries) {
          const updatedAt = typeof entry.updated_at === "string" ? entry.updated_at : ""
          const existingStamp = previousMetadata[entry.path] ?? ""
          const hasContent = fileContentsRef.current[entry.path] !== undefined
          if (!hasContent || existingStamp !== updatedAt) {
            await fetchFileContent(id, entry.path)
          }
        }
      } catch (error) {
        if (!filesErrorLoggedRef.current) {
          addLog(
            "error",
            `Failed to fetch files: ${error instanceof Error ? error.message : String(error)}`,
          )
          filesErrorLoggedRef.current = true
        }
      }
    },
    [addLog, apiBaseUrl, fetchFileContent],
  )

  const fetchProjectStatus = useCallback(
    async (id: string) => {
      try {
        const response = await fetch(`${apiBaseUrl}/projects/${id}/status`, { cache: "no-store" })
        if (!response.ok) {
          if (!statusErrorLoggedRef.current) {
            addLog("error", `Failed to fetch status (status ${response.status})`)
            statusErrorLoggedRef.current = true
          }
          return
        }
        statusErrorLoggedRef.current = false

        const data = await response.json()
        if (typeof data.status === "string") {
          setProjectStatus(data.status)
          if (data.status === "ready") {
            setActiveTab("preview")
          }
        }
        if (typeof data.preview_url === "string" && data.preview_url) {
          updatePreview(data.preview_url)
        }
      } catch (error) {
        if (!statusErrorLoggedRef.current) {
          addLog(
            "error",
            `Failed to fetch status: ${error instanceof Error ? error.message : String(error)}`,
          )
          statusErrorLoggedRef.current = true
        }
      }
    },
    [addLog, apiBaseUrl, updatePreview],
  )

  const pollProject = useCallback(
    async (id: string) => {
      await Promise.allSettled([fetchProjectStatus(id), fetchProjectFiles(id)])
    },
    [fetchProjectFiles, fetchProjectStatus],
  )

  const startPolling = useCallback(
    (id: string) => {
      pollProject(id).catch(() => {
        // errors surfaced via logging inside helpers
      })
      pollingRef.current = window.setInterval(() => {
        pollProject(id).catch(() => {
          // errors surfaced via logging inside helpers
        })
      }, 3000)
    },
    [pollProject],
  )

  const resetForNewGeneration = useCallback(() => {
    stopPolling()
    closeWebSocket()
    metadataRef.current = {}
    fileContentsRef.current = {}
    pendingFetchesRef.current.clear()
    statusErrorLoggedRef.current = false
    filesErrorLoggedRef.current = false
    activeAssistantMessageIdRef.current = null
    setProjectId(null)
    setProjectStatus(null)
    setFileOrder([])
    setFileContents({})
    setSelectedFile(null)
    setPreviewUrl("")
  }, [closeWebSocket, stopPolling])

  const triggerGeneration = useCallback(
    async (rawPrompt: string, options?: { clearPrompt?: boolean }) => {
      const trimmedPrompt = rawPrompt.trim()
      if (!trimmedPrompt) {
        addLog("error", "Please enter a prompt")
        return
      }

      lastPromptRef.current = trimmedPrompt

      resetForNewGeneration()

      const assistantMessageId = beginConversationTurn(trimmedPrompt)
      if (options?.clearPrompt ?? true) {
        setPromptState("")
      }

      setIsGenerating(true)
      setLogs([])
      addLog("info", "Starting generation...")
      addLog("info", `Prompt: ${trimmedPrompt}`)

      try {
        const response = await fetch(`${apiBaseUrl}/generate`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ prompt: trimmedPrompt }),
        })

        if (!response.ok) {
          throw new Error(`Generation failed (status ${response.status})`)
        }

        const data = await response.json()
        if (typeof data.project_id === "string") {
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
          startPolling(data.project_id)
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
      beginConversationTurn,
      resetForNewGeneration,
      startPolling,
      startWebSocket,
      updateAssistantMessage,
      updatePreview,
    ],
  )

  const handleGenerate = useCallback(async () => {
    await triggerGeneration(prompt, { clearPrompt: true })
  }, [prompt, triggerGeneration])

  const handleRegenerate = useCallback(async () => {
    const previousPrompt = lastPromptRef.current
    if (!previousPrompt.trim()) {
      addLog("info", "No previous prompt available to regenerate.")
      return
    }
    await triggerGeneration(previousPrompt, { clearPrompt: false })
  }, [addLog, triggerGeneration])

  const handleRefreshPreview = useCallback(() => {
    if (!previewUrl) {
      return
    }
    addLog("info", "Refreshing preview...")
    try {
      const url = new URL(previewUrl)
      url.searchParams.set("t", Date.now().toString())
      setPreviewUrl(url.toString())
    } catch {
      setPreviewUrl(`${previewUrl}?t=${Date.now()}`)
    }
    addLog("success", "Preview refreshed")
  }, [addLog, previewUrl])

  const filesForViewer = useMemo<ViewerFile[]>(
    () => fileOrder.map((path) => ({ path, content: fileContents[path] })),
    [fileContents, fileOrder],
  )

  useEffect(() => {
    if (filesForViewer.length === 0) {
      setSelectedFile(null)
      return
    }
    if (!selectedFile || !filesForViewer.some((file) => file.path === selectedFile)) {
      setSelectedFile(filesForViewer[0].path)
    }
  }, [filesForViewer, selectedFile, setSelectedFile])

  const showRegenerate = projectId !== null || filesForViewer.length > 0
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
    handleRegenerate,
    handleRefreshPreview,
    showRegenerate,
    codeViewerLoading,
  }
}
