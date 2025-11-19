import { useState, useRef, useCallback, useEffect } from "react"
import type {
  LogEntry,
  ConversationMessage,
  ViewerFile,
} from "../types"
import { updateMessage } from "../utils/conversation"

export function useProjectState() {
  const [prompt, setPrompt] = useState("")
  const [isGenerating, setIsGenerating] = useState(false)
  const [logs, setLogs] = useState<LogEntry[]>([])
  const [messages, setMessages] = useState<ConversationMessage[]>([])
  const [activeTab, setActiveTab] = useState("code")
  const [previewUrl, setPreviewUrl] = useState("")
  const [projectId, setProjectId] = useState<string | null>(null)
  const [projectStatus, setProjectStatus] = useState<string | null>(null)
  const [fileOrder, setFileOrder] = useState<string[]>([])
  const [fileContents, setFileContents] = useState<Record<string, string>>({})
  const [selectedFile, setSelectedFile] = useState<string | null>(null)

  // Refs for stable access in callbacks/effects
  const projectIdRef = useRef<string | null>(null)
  const activeAssistantMessageIdRef = useRef<string | null>(null)
  const fileContentsRef = useRef<Record<string, string>>({})
  const metadataRef = useRef<Record<string, string>>({})
  const pendingFetchesRef = useRef<Set<string>>(new Set())
  const statusErrorLoggedRef = useRef(false)
  const filesErrorLoggedRef = useRef(false)
  const basePreviewUrlRef = useRef<string>("")
  const previewUrlWithTokenRef = useRef<string>("")

  // Sync refs
  useEffect(() => {
    projectIdRef.current = projectId
  }, [projectId])

  useEffect(() => {
    fileContentsRef.current = fileContents
  }, [fileContents])

  const addLog = useCallback((type: LogEntry["type"], message: string) => {
    setLogs((prev) => [...prev, { type, message }])
  }, [])

  const updateAssistantMessage = useCallback(
    (
      id: string | null,
      patch:
        | Partial<ConversationMessage>
        | ((message: ConversationMessage) => Partial<ConversationMessage>)
    ) => {
      if (!id) return
      setMessages((previous) =>
        previous.map((message) =>
          message.id === id ? updateMessage(message, patch) : message
        )
      )
    },
    []
  )

  const updateActiveAssistantMessage = useCallback(
    (
      patch:
        | Partial<ConversationMessage>
        | ((message: ConversationMessage) => Partial<ConversationMessage>)
    ) => {
      updateAssistantMessage(activeAssistantMessageIdRef.current, patch)
    },
    [updateAssistantMessage]
  )

  const resetState = useCallback(() => {
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
  }, [])

  const resetFullState = useCallback(() => {
    resetState()
    setMessages([])
    setLogs([])
    setPrompt("")
    setIsGenerating(false)
    setActiveTab("code")
  }, [resetState])

  return {
    // State
    prompt,
    setPrompt,
    isGenerating,
    setIsGenerating,
    logs,
    setLogs,
    messages,
    setMessages,
    activeTab,
    setActiveTab,
    previewUrl,
    setPreviewUrl,
    projectId,
    setProjectId,
    projectStatus,
    setProjectStatus,
    fileOrder,
    setFileOrder,
    fileContents,
    setFileContents,
    selectedFile,
    setSelectedFile,

    // Refs
    projectIdRef,
    activeAssistantMessageIdRef,
    fileContentsRef,
    metadataRef,
    pendingFetchesRef,
    statusErrorLoggedRef,
    filesErrorLoggedRef,
    basePreviewUrlRef,
    previewUrlWithTokenRef,

    // Helpers
    addLog,
    updateAssistantMessage,
    updateActiveAssistantMessage,
    resetState,
    resetFullState,
  }
}

