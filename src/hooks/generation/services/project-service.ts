export type ProjectServiceHandlers = {
  addLog: (type: "info" | "error" | "success", message: string) => void;
  setProjectStatus: (status: string) => void;
  setActiveTab: (tab: string) => void;
  updatePreview: (raw?: string | null) => void;
  getApiBaseUrl: () => string;
  getAuthHeaders: () => Promise<Record<string, string>>;
};

export const fetchProjectStatus = async (
  projectId: string,
  handlers: ProjectServiceHandlers,
  statusErrorLoggedRef: React.RefObject<boolean>,
): Promise<void> => {
  try {
    const headers = await handlers.getAuthHeaders();
    const apiBaseUrl = handlers.getApiBaseUrl();
    const response = await fetch(`${apiBaseUrl}/projects/${projectId}/status`, {
      cache: "no-store",
      credentials: "include",
      headers,
    });

    if (!response.ok) {
      if (!statusErrorLoggedRef.current) {
        handlers.addLog(
          "error",
          `Failed to fetch status (status ${response.status})`,
        );
        statusErrorLoggedRef.current = true;
      }
      return;
    }
    statusErrorLoggedRef.current = false;

    const data = await response.json();
    if (typeof data.status === "string") {
      handlers.setProjectStatus(data.status);
    }
    if (typeof data.preview_url === "string" && data.preview_url) {
      handlers.updatePreview(data.preview_url);
    }
  } catch (error) {
    if (!statusErrorLoggedRef.current) {
      handlers.addLog(
        "error",
        `Failed to fetch status: ${error instanceof Error ? error.message : String(error)}`,
      );
      statusErrorLoggedRef.current = true;
    }
  }
};

export const pollProject = async (
  projectId: string,
  handlers: ProjectServiceHandlers,
  fileHandlers: {
    fetchProjectFiles: () => Promise<void>;
  },
  statusErrorLoggedRef: React.RefObject<boolean>,
): Promise<void> => {
  await Promise.allSettled([
    fetchProjectStatus(projectId, handlers, statusErrorLoggedRef),
    fileHandlers.fetchProjectFiles(),
  ]);
};

export const startPolling = (
  projectId: string,
  handlers: ProjectServiceHandlers,
  fileHandlers: {
    fetchProjectFiles: () => Promise<void>;
  },
  statusErrorLoggedRef: React.RefObject<boolean>,
  pollingRef: React.RefObject<number | null>,
): void => {
  pollProject(projectId, handlers, fileHandlers, statusErrorLoggedRef).catch(
    () => {
      // errors surfaced via logging inside helpers
    },
  );
  pollingRef.current = window.setInterval(() => {
    pollProject(projectId, handlers, fileHandlers, statusErrorLoggedRef).catch(
      () => {
        // errors surfaced via logging inside helpers
      },
    );
  }, 3000);
};

export const stopPolling = (
  pollingRef: React.RefObject<number | null>,
): void => {
  if (pollingRef.current !== null) {
    window.clearInterval(pollingRef.current);
    pollingRef.current = null;
  }
};
