import { useCallback, useRef, useEffect } from "react"
import { beginConversationTurn } from "../utils/conversation"
import { getAuthHeaders } from "../utils/api"
import { startPolling, stopPolling } from "../services/project-service"
import type { ProjectServiceHandlers } from "../services/project-service"
import type {
  ConversationStatus,
  ConversationMessage,
  InlineGeneratedFile,
} from "../types"
import type { useProjectState } from "./use-project-state"
import type { useProjectWebSocket } from "./use-project-websocket"
import type { useFileService } from "./use-file-service"
import type { SessionData } from "@/lib/auth-client"

type ProjectState = ReturnType<typeof useProjectState>
type ProjectWebSocket = ReturnType<typeof useProjectWebSocket>
type FileService = ReturnType<typeof useFileService>

export function useProjectActions(
  state: ProjectState,
  websocket: ProjectWebSocket,
  fileService: FileService,
  apiBaseUrl: string,
  session: SessionData | null
) {
  const pollingRef = useRef<number | null>(null)

  const {
    setPrompt,
    setIsGenerating,
    setLogs,
    setMessages,
    setProjectId,
    setProjectStatus,
    setFileOrder,
    setFileContents,
    setSelectedFile,
    setActiveTab,
    addLog,
    updateAssistantMessage,
    resetFullState,
    resetState,
    projectIdRef,
    activeAssistantMessageIdRef,
    metadataRef,
    fileContentsRef,
    pendingFetchesRef,
    statusErrorLoggedRef,
    filesErrorLoggedRef,
  } = state

  const { startWebSocket, closeWebSocket, updatePreview } = websocket
  const { fetchProjectFilesHandler } = fileService

  // Project service handlers
  const projectServiceHandlers: ProjectServiceHandlers = {
    addLog,
    setProjectStatus,
    setActiveTab,
    updatePreview,
    getApiBaseUrl: () => apiBaseUrl,
    getAuthHeaders: async () => getAuthHeaders(session),
  }

  // Polling management
  useEffect(() => {
    return () => {
      stopPolling(pollingRef)
    }
  }, [])

  const startPollingHandler = useCallback(
    (id: string) => {
      startPolling(
        id,
        projectServiceHandlers,
        { fetchProjectFiles: fetchProjectFilesHandler },
        statusErrorLoggedRef,
        pollingRef
      )
    },
    [projectServiceHandlers, fetchProjectFilesHandler, statusErrorLoggedRef]
  )

  const beginTurn = useCallback(
    (
      userContent: string,
      assistantIntro = "",
      projectIdValue?: string | null
    ) => {
      const result = beginConversationTurn(
        userContent,
        assistantIntro,
        projectIdValue
      )
      if (!result) {
        return null
      }
      const { userMessage, assistantMessage } = result
      setMessages((previous) => [...previous, userMessage, assistantMessage])
      activeAssistantMessageIdRef.current = assistantMessage.id
      return {
        userMessageId: userMessage.id,
        assistantMessageId: assistantMessage.id,
      }
    },
    [setMessages, activeAssistantMessageIdRef]
  )

  const resetForNewGeneration = useCallback(() => {
    stopPolling(pollingRef)
    closeWebSocket()
    resetState()
  }, [closeWebSocket, resetState])

  const resetForNewChat = useCallback(() => {
    resetForNewGeneration()
    resetFullState()
  }, [resetForNewGeneration, resetFullState])

  const triggerGeneration = useCallback(
    async (
      rawPrompt: string,
      options?: { clearPrompt?: boolean; assistantIntro?: string }
    ) => {
      const trimmedPrompt = rawPrompt.trim()
      if (!trimmedPrompt) {
        addLog("error", "Please enter a prompt")
        return
      }

      const assistantIntro = options?.assistantIntro ?? ""
      const existingProjectId = projectIdRef.current

      if (!existingProjectId) {
        resetForNewGeneration()

        const turn = beginTurn(trimmedPrompt, assistantIntro)
        if (!turn) {
          return
        }
        const { assistantMessageId } = turn

        if (options?.clearPrompt ?? true) {
          setPrompt("")
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
            addLog(
              "success",
              `Generation request accepted (project ${data.project_id})`
            )
            updateAssistantMessage(assistantMessageId, {
              status: "pending",
              projectId: data.project_id,
            })
            startWebSocket(data.project_id)
            startPollingHandler(data.project_id)
            setActiveTab("code")
            return
          }

          const inlineFiles: InlineGeneratedFile[] = Array.isArray(data.files)
            ? data.files
            : []
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
            if (
              typeof data.preview_url === "string" &&
              data.preview_url.trim()
            ) {
              updatePreview(data.preview_url)
              addLog("success", "Preview server started")
              setActiveTab("preview")
            }
            const summarySegments: string[] = []
            if (inlineFiles.length > 0) {
              summarySegments.push(
                `Generated ${inlineFiles.length} file${inlineFiles.length === 1 ? "" : "s"}.`
              )
            }
            if (
              typeof data.preview_url === "string" &&
              data.preview_url.trim()
            ) {
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
          addLog(
            "error",
            error instanceof Error ? error.message : "An error occurred"
          )
          updateAssistantMessage(assistantMessageId, {
            content:
              error instanceof Error
                ? error.message
                : "An unexpected error occurred.",
            status: "error",
          })
        } finally {
          setIsGenerating(false)
        }

        return
      }

      const turn = beginTurn(trimmedPrompt, assistantIntro, existingProjectId)
      if (!turn) {
        return
      }
      const { userMessageId, assistantMessageId } = turn

      if (options?.clearPrompt ?? true) {
        setPrompt("")
      }

      setIsGenerating(true)
      addLog("info", `Updating project ${existingProjectId}...`)

      try {
        const headers = await getAuthHeaders(session)
        const response = await fetch(
          `${apiBaseUrl}/projects/${existingProjectId}/messages`,
          {
            method: "POST",
            credentials: "include",
            headers: {
              ...headers,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              content: trimmedPrompt,
              assistant_intro: assistantIntro,
            }),
          }
        )

        if (!response.ok) {
          throw new Error(`Update failed (status ${response.status})`)
        }

        const data = await response.json()
        if (typeof data.status === "string") {
          setProjectStatus(data.status)
        }

        const userMessage = data.user_message
        if (userMessage && typeof userMessage === "object") {
          const serverId =
            typeof userMessage.id === "string" ? userMessage.id : userMessageId
          const createdAt =
            typeof userMessage.created_at === "string"
              ? Date.parse(userMessage.created_at)
              : Date.now()
          const updatedAt =
            typeof userMessage.updated_at === "string"
              ? Date.parse(userMessage.updated_at)
              : createdAt
          const statusFromServer =
            typeof userMessage.status === "string"
              ? userMessage.status
              : "complete"
          const normalizedStatus: ConversationStatus =
            statusFromServer === "pending" || statusFromServer === "error"
              ? statusFromServer
              : "complete"

          setMessages((previous) =>
            previous.map((message) => {
              if (message.id !== userMessageId) {
                return message
              }
              return {
                ...message,
                id: serverId,
                projectId:
                  typeof userMessage.project_id === "string"
                    ? userMessage.project_id
                    : existingProjectId,
                content:
                  typeof userMessage.content === "string" &&
                  userMessage.content.length > 0
                    ? userMessage.content
                    : message.content,
                status: normalizedStatus,
                createdAt: Number.isNaN(createdAt)
                  ? message.createdAt
                  : createdAt,
                updatedAt: Number.isNaN(updatedAt)
                  ? message.updatedAt
                  : updatedAt,
              }
            })
          )
        }

        updateAssistantMessage(assistantMessageId, {
          status: "pending",
          projectId: existingProjectId,
        })

        startWebSocket(existingProjectId)
        setActiveTab("code")
        addLog("success", "Update accepted")
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Failed to send update"
        addLog("error", message)
        updateAssistantMessage(assistantMessageId, {
          content: message,
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
      projectIdRef,
      setPrompt,
      setIsGenerating,
      setLogs,
      setProjectId,
      setProjectStatus,
      setActiveTab,
      setFileOrder,
      setFileContents,
      setSelectedFile,
      metadataRef,
      fileContentsRef,
      setMessages,
    ]
  )

  const loadProject = useCallback(
    async (id: string) => {
      resetForNewGeneration()
      setMessages([])
      activeAssistantMessageIdRef.current = null

      projectIdRef.current = id
      setProjectId(id)

      addLog("info", `Loading project ${id}...`)

      try {
        const headers = await getAuthHeaders(session)
        const statusResponse = await fetch(
          `${apiBaseUrl}/projects/${id}/status`,
          {
            cache: "no-store",
            credentials: "include",
            headers,
          }
        )

        if (!statusResponse.ok) {
          throw new Error(`Failed to load project: ${statusResponse.status}`)
        }

        const statusData = await statusResponse.json()

        if (typeof statusData.status === "string") {
          setProjectStatus(statusData.status)
        }

        if (
          typeof statusData.preview_url === "string" &&
          statusData.preview_url
        ) {
          await updatePreview(statusData.preview_url)
        }

        const messagesResponse = await fetch(
          `${apiBaseUrl}/projects/${id}/messages`,
          {
            cache: "no-store",
            credentials: "include",
            headers,
          }
        )

        if (messagesResponse.ok) {
          const messagesData = await messagesResponse.json()
          const mappedMessages: ConversationMessage[] = Array.isArray(
            messagesData?.messages
          )
            ? messagesData.messages
                .map((message: any): ConversationMessage | null => {
                  if (!message || typeof message !== "object") {
                    return null
                  }
                  const createdAtRaw =
                    typeof message.created_at === "string"
                      ? Date.parse(message.created_at)
                      : Date.now()
                  const updatedAtRaw =
                    typeof message.updated_at === "string"
                      ? Date.parse(message.updated_at)
                      : createdAtRaw
                  const createdAt = Number.isNaN(createdAtRaw)
                    ? Date.now()
                    : createdAtRaw
                  const updatedAt = Number.isNaN(updatedAtRaw)
                    ? createdAt
                    : updatedAtRaw
                  const statusValue =
                    typeof message.status === "string"
                      ? message.status
                      : "complete"
                  const normalizedStatus: ConversationStatus =
                    statusValue === "pending" || statusValue === "error"
                      ? statusValue
                      : "complete"

                  return {
                    id:
                      typeof message.id === "string"
                        ? message.id
                        : `msg-${id}-${createdAt}`,
                    role: message.role === "assistant" ? "assistant" : "user",
                    content:
                      typeof message.content === "string"
                        ? message.content
                        : "",
                    status: normalizedStatus,
                    createdAt,
                    updatedAt,
                    projectId:
                      typeof message.project_id === "string"
                        ? message.project_id
                        : id,
                  }
                })
                .filter(
                  (
                    message: ConversationMessage | null
                  ): message is ConversationMessage => Boolean(message)
                )
            : []

          setMessages(mappedMessages)

          const pendingAssistant = [...mappedMessages]
            .reverse()
            .find(
              (message) =>
                message.role === "assistant" && message.status === "pending"
            )
          activeAssistantMessageIdRef.current = pendingAssistant
            ? pendingAssistant.id
            : null
        } else {
          activeAssistantMessageIdRef.current = null
        }

        startWebSocket(id)
        startPollingHandler(id)
        await fetchProjectFilesHandler()

        if (statusData.preview_url) {
          setActiveTab("preview")
        } else {
          setActiveTab("code")
        }

        addLog("success", `Project ${id} loaded`)
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Failed to load project"
        addLog("error", message)
        setMessages([
          {
            id: `load-error-${Date.now()}`,
            role: "assistant",
            content: message,
            status: "error",
            createdAt: Date.now(),
            updatedAt: Date.now(),
            projectId: id,
          },
        ])
        activeAssistantMessageIdRef.current = null
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
      updatePreview,
      setActiveTab,
      setMessages,
      setProjectId,
      setProjectStatus,
      projectIdRef,
      activeAssistantMessageIdRef,
    ]
  )

  return {
    triggerGeneration,
    loadProject,
    resetForNewChat,
  }
}
