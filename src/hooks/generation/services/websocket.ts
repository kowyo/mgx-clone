import type { LogEntry } from "../types"
import type { ConversationMessage } from "../types"
import { buildWsUrl } from "../utils/api"

export type WebSocketMessageHandler = {
  onStatusSnapshot: (status: string | undefined, previewUrl: string | undefined) => void
  onStatusUpdated: (status: string) => void
  onLogAppended: (message: string) => void
  onPreviewReady: (previewUrl: string) => void
  onError: (message: string) => void
  onProjectCreated: (message: string) => void
  onAssistantMessage: (payload: { text?: string; model?: string; stop_reason?: string }) => void
  onToolUse: (payload: { id?: string; name?: string; input?: unknown }) => void
  onResultMessage: (payload: { total_cost_usd?: number; stop_reason?: string; usage?: { input_tokens?: number; output_tokens?: number } }) => void
  addLog: (type: LogEntry["type"], message: string) => void
  updateActiveAssistantMessage: (
    next: Partial<ConversationMessage> | ((message: ConversationMessage) => Partial<ConversationMessage>),
  ) => void
  setProjectStatus: (status: string) => void
  setActiveTab: (tab: string) => void
  updatePreview: (raw?: string | null) => void
}

export const createWebSocket = (
  projectId: string,
  wsBaseEnv: string | null,
  backendOrigin: string,
  handlers: WebSocketMessageHandler,
): WebSocket | null => {
  try {
    const url = buildWsUrl(projectId, wsBaseEnv, backendOrigin)
    const socket = new WebSocket(url)
    
    socket.onopen = () => handlers.addLog("info", "Connected to generation stream")
    
    socket.onmessage = (event) => {
      handleWebSocketMessage(event.data, handlers)
    }
    
    socket.onerror = () => handlers.addLog("error", "WebSocket connection error")
    
    socket.onclose = (event) => {
      if (event.code !== 1000) {
        handlers.addLog("info", `Stream closed (${event.code})`)
      }
    }
    
    return socket
  } catch (error) {
    handlers.addLog("error", `Failed to open WebSocket: ${error instanceof Error ? error.message : String(error)}`)
    return null
  }
}

const handleWebSocketMessage = (raw: string, handlers: WebSocketMessageHandler): void => {
  try {
    const data = JSON.parse(raw)

    if (data.type === "status_snapshot") {
      const status = data.payload?.status
      if (typeof status === "string") {
        handlers.onStatusSnapshot(status, data.payload?.preview_url)
      } else {
        handlers.onStatusSnapshot(undefined, data.payload?.preview_url)
      }
      return
    }

    if (data.type === "status_updated") {
      const status = data.payload?.status ?? data.message
      if (typeof status === "string") {
        handlers.onStatusUpdated(status)
      }
      return
    }

    if (data.type === "log_appended" && typeof data.message === "string") {
      handlers.onLogAppended(data.message)
      return
    }

    if (data.type === "preview_ready") {
      const preview = data.payload?.preview_url
      if (typeof preview === "string") {
        handlers.onPreviewReady(preview)
      }
      return
    }

    if (data.type === "error") {
      if (typeof data.message === "string") {
        handlers.onError(data.message)
      } else {
        handlers.onError("Generation error")
      }
      return
    }

    if (data.type === "project_created" && typeof data.message === "string") {
      handlers.onProjectCreated(data.message)
      return
    }

    if (data.type === "assistant_message" && data.payload) {
      handlers.onAssistantMessage(data.payload)
      return
    }

    if (data.type === "tool_use" && data.payload) {
      handlers.onToolUse(data.payload)
      return
    }

    if (data.type === "result_message" && data.payload) {
      handlers.onResultMessage(data.payload)
      return
    }
  } catch (error) {
    handlers.addLog(
      "error",
      `Failed to parse stream message: ${error instanceof Error ? error.message : String(error)}`,
    )
  }
}

