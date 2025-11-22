import { useCallback, useEffect, useMemo, useRef } from "react"
import { createWebSocket } from "../services/websocket"
import type { WebSocketMessageHandler } from "../services/websocket"
import { getBackendOrigin, getWsBaseUrl } from "../utils/api"
import { toAbsolutePreviewUrl } from "../utils/preview"
import type { useProjectState } from "./use-project-state"
import type { SessionData } from "@/lib/auth-client"

type ProjectState = ReturnType<typeof useProjectState>

export function useProjectWebSocket(
  state: ProjectState,
  apiBaseUrl: string,
  session: SessionData | null
) {
  const wsRef = useRef<WebSocket | null>(null)
  const wsBaseEnv = useMemo(() => getWsBaseUrl(), [])
  const backendOrigin = useMemo(
    () => getBackendOrigin(apiBaseUrl),
    [apiBaseUrl]
  )

  const {
    setProjectStatus,
    addLog,
    updateActiveAssistantMessage,
    setActiveTab,
    basePreviewUrlRef,
    previewUrlWithTokenRef,
    setPreviewUrl,
  } = state

  // Preview URL management wrapper
  const updatePreview = useCallback(
    async (raw?: string | null) => {
      if (!raw) {
        basePreviewUrlRef.current = ""
        previewUrlWithTokenRef.current = ""
        setPreviewUrl("")
        return
      }
      try {
        const url = await toAbsolutePreviewUrl(
          raw,
          backendOrigin,
          session,
          basePreviewUrlRef,
          previewUrlWithTokenRef
        )
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
    [
      backendOrigin,
      session,
      basePreviewUrlRef,
      previewUrlWithTokenRef,
      setPreviewUrl,
    ]
  )

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
        addLog(
          status === "ready" ? "success" : "info",
          `Status changed to ${status}`
        )
        updateActiveAssistantMessage(() => ({
          status:
            status === "failed"
              ? "error"
              : status === "ready"
                ? "complete"
                : "pending",
        }))
      },
      onLogAppended: (message) => {
        addLog("info", message)
      },
      onPreviewReady: (preview) => {
        updatePreview(preview)
        addLog("success", "Preview ready")
      },
      onError: (message) => {
        addLog("error", message)
        updateActiveAssistantMessage((msg) => ({
          content: msg.content
            ? `${msg.content}\n\n❌ Error: ${message}`
            : message,
          status: "error",
        }))
        setProjectStatus("failed")
      },
      onProjectCreated: () => {
        // No-op
      },
      onAssistantMessage: (payload) => {
        const text = payload.text || ""
        if (text) {
          updateActiveAssistantMessage((msg) => ({
            content: msg.content ? `${msg.content}\n${text}`.trim() : text,
            status: "pending",
          }))
        }
      },
      onToolUse: (payload) => {
        const toolName = payload.name || "Tool"
        const inputStr = payload.input
          ? JSON.stringify(payload.input, null, 2)
          : ""
        const toolMessage = `🔧 Using ${toolName}${inputStr ? `:\n\`\`\`json\n${inputStr}\n\`\`\`` : ""}`
        updateActiveAssistantMessage((msg) => ({
          content: msg.content
            ? `${msg.content}\n\n${toolMessage}`.trim()
            : toolMessage,
          status: "pending",
        }))
      },
      onResultMessage: (_payload) => {
        updateActiveAssistantMessage((msg) => ({
          content: msg.content,
          status: "complete",
        }))
      },
      addLog,
      updateActiveAssistantMessage,
      setProjectStatus,
      setActiveTab,
      updatePreview,
    }),
    [
      addLog,
      updateActiveAssistantMessage,
      setProjectStatus,
      setActiveTab,
      updatePreview,
    ]
  )

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
    [closeWebSocket, wsBaseEnv, backendOrigin, wsHandlers]
  )

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      closeWebSocket()
    }
  }, [closeWebSocket])

  return {
    startWebSocket,
    closeWebSocket,
    updatePreview,
  }
}
