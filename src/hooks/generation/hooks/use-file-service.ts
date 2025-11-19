import { useCallback, useMemo } from "react"
import { fetchProjectFiles } from "../services/file-service"
import type { FileServiceHandlers } from "../services/file-service"
import { getAuthHeaders } from "../utils/api"
import type { useProjectState } from "./use-project-state"
import type { SessionData } from "@/lib/auth-client"

type ProjectState = ReturnType<typeof useProjectState>

export function useFileService(
  state: ProjectState,
  apiBaseUrl: string,
  session: SessionData | null
) {
  const {
    addLog,
    setFileOrder,
    setFileContents,
    fileContentsRef,
    projectIdRef,
    metadataRef,
    pendingFetchesRef,
    filesErrorLoggedRef,
  } = state

  const fileServiceHandlers: FileServiceHandlers = useMemo(
    () => ({
      addLog,
      setFileOrder: (order: string[]) => {
        setFileOrder(order)
      },
      setFileContents: (
        updater: (prev: Record<string, string>) => Record<string, string>
      ) => {
        setFileContents(updater)
      },
      getFileContents: () => fileContentsRef.current,
      getApiBaseUrl: () => apiBaseUrl,
      getAuthHeaders: async () => getAuthHeaders(session),
    }),
    [
      addLog,
      apiBaseUrl,
      session,
      setFileOrder,
      setFileContents,
      fileContentsRef,
    ]
  )

  const fetchProjectFilesHandler = useCallback(async () => {
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
      filesErrorLoggedRef
    )
  }, [
    fileServiceHandlers,
    projectIdRef,
    metadataRef,
    fileContentsRef,
    pendingFetchesRef,
    filesErrorLoggedRef,
  ])

  return {
    fileServiceHandlers,
    fetchProjectFilesHandler,
  }
}
