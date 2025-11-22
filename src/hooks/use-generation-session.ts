import { useCallback, useEffect, useMemo } from "react"
import { useSession } from "@/lib/auth-client"
import type {
  LogEntry,
  ConversationMessage,
  ViewerFile,
  UseGenerationSessionReturn,
} from "./generation/types"
import { refreshPreviewUrl } from "./generation/utils/preview"
import { getApiBaseUrl } from "./generation/utils/api"
import { useProjectState } from "./generation/hooks/use-project-state"
import { useProjectWebSocket } from "./generation/hooks/use-project-websocket"
import { useFileService } from "./generation/hooks/use-file-service"
import { useProjectActions } from "./generation/hooks/use-project-actions"

// Re-export types for backward compatibility
export type {
  LogEntry,
  ConversationMessage,
  ViewerFile,
  UseGenerationSessionReturn,
}

export function useGenerationSession(): UseGenerationSessionReturn {
  const { data: session } = useSession()
  const apiBaseUrl = useMemo(() => getApiBaseUrl(), [])

  // 1. State Management
  const state = useProjectState()
  const {
    prompt,
    setPrompt,
    isGenerating,
    logs,
    messages,
    activeTab,
    setActiveTab,
    previewUrl,
    setPreviewUrl,
    projectId,
    projectStatus,
    fileOrder,
    fileContents,
    selectedFile,
    setSelectedFile,
    addLog,
  } = state

  // 2. WebSocket Management
  const websocket = useProjectWebSocket(state, apiBaseUrl, session)

  // 3. File Service
  const fileService = useFileService(state, apiBaseUrl, session)

  // 4. Actions (API interactions)
  const actions = useProjectActions(
    state,
    websocket,
    fileService,
    apiBaseUrl,
    session
  )
  const { triggerGeneration, loadProject, resetForNewChat } = actions

  // Derived state
  const filesForViewer = useMemo<ViewerFile[]>(() => {
    const files = fileOrder.map((path) => ({
      path,
      content: fileContents[path],
    }))
    return files
  }, [fileContents, fileOrder])

  // Auto-select first file
  useEffect(() => {
    if (filesForViewer.length === 0) {
      setSelectedFile(null)
      return
    }
    if (
      !selectedFile ||
      !filesForViewer.some((file) => file.path === selectedFile)
    ) {
      setSelectedFile(filesForViewer[0].path)
    }
  }, [filesForViewer, selectedFile, setSelectedFile])

  const codeViewerLoading =
    projectId !== null &&
    filesForViewer.length === 0 &&
    projectStatus !== "failed"

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
  }, [addLog, previewUrl, setPreviewUrl])

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
    resetForNewChat,
    codeViewerLoading,
  }
}
