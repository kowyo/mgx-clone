"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { Card } from "@/components/ui/card"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Loader2, Play, RotateCcw, Code2, Eye } from "lucide-react"
import { CodeViewer } from "@/components/code-viewer"
import { PreviewWindow } from "@/components/preview-window"
import { StatusPanel } from "@/components/status-panel"

type LogEntry = { type: "info" | "error" | "success"; message: string }
type InlineGeneratedFile = { path?: string; content?: string | null }
type ApiProjectFileEntry = { path?: string; is_dir?: boolean; updated_at?: string | null }

export default function Home() {
  const [prompt, setPrompt] = useState("")
  const [isGenerating, setIsGenerating] = useState(false)
  const [logs, setLogs] = useState<LogEntry[]>([])
  const [activeTab, setActiveTab] = useState("code")
  const [previewUrl, setPreviewUrl] = useState("")
  const [projectId, setProjectId] = useState<string | null>(null)
  const [projectStatus, setProjectStatus] = useState<string | null>(null)
  const [fileOrder, setFileOrder] = useState<string[]>([])
  const [fileContents, setFileContents] = useState<Record<string, string>>({})
  const [selectedFile, setSelectedFile] = useState<string | null>(null)

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

  useEffect(() => {
    fileContentsRef.current = fileContents
  }, [fileContents])

  const addLog = useCallback((type: LogEntry["type"], message: string) => {
    setLogs((prev) => [...prev, { type, message }])
  }, [])

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
          }
          return
        }

        if (data.type === "error") {
          if (typeof data.message === "string") {
            addLog("error", data.message)
          } else {
            addLog("error", "Generation error")
          }
          setProjectStatus("failed")
          return
        }

        if (data.type === "project_created" && typeof data.message === "string") {
          addLog("info", data.message)
          return
        }
      } catch (error) {
        addLog(
          "error",
          `Failed to parse stream message: ${error instanceof Error ? error.message : String(error)}`,
        )
      }
    },
    [addLog, updatePreview],
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
    setProjectId(null)
    setProjectStatus(null)
    setFileOrder([])
    setFileContents({})
    setSelectedFile(null)
    setPreviewUrl("")
  }, [closeWebSocket, stopPolling])

  const handleGenerate = async () => {
    if (!prompt.trim()) {
      addLog("error", "Please enter a prompt")
      return
    }

    resetForNewGeneration()
    setIsGenerating(true)
    setLogs([])
    addLog("info", "Starting generation...")
    addLog("info", `Prompt: ${prompt}`)

    try {
      const response = await fetch(`${apiBaseUrl}/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt }),
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
        return
      }

      throw new Error("Unexpected response from backend")
    } catch (error) {
      addLog("error", error instanceof Error ? error.message : "An error occurred")
    } finally {
      setIsGenerating(false)
    }
  }

  const handleRegenerate = () => {
    handleGenerate()
  }

  const handleRefreshPreview = () => {
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
  }

  const filesForViewer = useMemo(
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
  }, [filesForViewer, selectedFile])

  const showRegenerate = projectId !== null || filesForViewer.length > 0
  const codeViewerLoading = projectId !== null && filesForViewer.length === 0 && projectStatus !== "failed"

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b border-border bg-card">
        <div className="container mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary">
                <Code2 className="h-5 w-5 text-primary-foreground" />
              </div>
              <h1 className="text-xl font-semibold text-foreground">MGX</h1>
              <span className="text-sm text-muted-foreground">Best AI code generator</span>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="container mx-auto px-6 py-8">
        <div className="grid gap-6 lg:grid-cols-2">
          {/* Left Column - Input & Code */}
          <div className="flex flex-col gap-6">
            {/* Prompt Input */}
            <Card className="p-6">
              <h2 className="mb-4 text-lg font-semibold text-foreground">Describe Your App</h2>
              <Textarea
                placeholder="Example: Build a todo app with React that has add, delete, and mark as complete features..."
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                className="mb-4 min-h-[120px] font-mono text-sm"
                disabled={isGenerating}
              />
              <div className="flex gap-3">
                <Button onClick={handleGenerate} disabled={isGenerating || !prompt.trim()} className="flex-1">
                  {isGenerating ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Generating...
                    </>
                  ) : (
                    <>
                      <Play className="mr-2 h-4 w-4" />
                      Generate
                    </>
                  )}
                </Button>
                {showRegenerate && (
                  <Button onClick={handleRegenerate} variant="outline" disabled={isGenerating}>
                    <RotateCcw className="mr-2 h-4 w-4" />
                    Regenerate
                  </Button>
                )}
              </div>
            </Card>

            {/* Status Panel */}
            <StatusPanel logs={logs} />
          </div>

          {/* Right Column - Code & Preview */}
          <div className="flex flex-col">
            <Card className="flex-1 overflow-hidden">
              <Tabs value={activeTab} onValueChange={setActiveTab} className="h-full">
                <div className="border-b border-border px-6 pt-4">
                  <TabsList className="w-full justify-start">
                    <TabsTrigger value="code" className="gap-2">
                      <Code2 className="h-4 w-4" />
                      Code
                    </TabsTrigger>
                    <TabsTrigger value="preview" className="gap-2" disabled={!previewUrl}>
                      <Eye className="h-4 w-4" />
                      Preview
                    </TabsTrigger>
                  </TabsList>
                </div>

                <TabsContent value="code" className="h-[calc(100vh-280px)] p-0">
                  <CodeViewer files={filesForViewer} selectedFile={selectedFile} onSelect={setSelectedFile} loading={codeViewerLoading} />
                </TabsContent>

                <TabsContent value="preview" className="h-[calc(100vh-280px)] p-0">
                  <PreviewWindow url={previewUrl} onRefresh={handleRefreshPreview} />
                </TabsContent>
              </Tabs>
            </Card>
          </div>
        </div>
      </main>
    </div>
  )
}
