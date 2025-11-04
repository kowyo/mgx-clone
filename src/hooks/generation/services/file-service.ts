import type { ApiProjectFileEntry } from "../types";

export type FileServiceHandlers = {
  addLog: (type: "info" | "error" | "success", message: string) => void;
  setFileOrder: (order: string[]) => void;
  setFileContents: (
    updater: (prev: Record<string, string>) => Record<string, string>,
  ) => void;
  getFileContents: () => Record<string, string>;
  getApiBaseUrl: () => string;
  getAuthHeaders: () => Promise<Record<string, string>>;
};

export const fetchFileContent = async (
  projectId: string,
  path: string,
  handlers: FileServiceHandlers,
  pendingFetchesRef: React.RefObject<Set<string>>,
): Promise<void> => {
  if (pendingFetchesRef.current.has(path)) {
    return;
  }
  pendingFetchesRef.current.add(path);

  try {
    const encodedPath = path
      .split("/")
      .map((segment) => encodeURIComponent(segment))
      .join("/");
    const headers = await handlers.getAuthHeaders();
    const apiBaseUrl = handlers.getApiBaseUrl();
    const response = await fetch(
      `${apiBaseUrl}/projects/${projectId}/files/${encodedPath}`,
      {
        cache: "no-store",
        credentials: "include",
        headers,
      },
    );
    if (!response.ok) {
      throw new Error(`status ${response.status}`);
    }
    const content = await response.text();
    handlers.setFileContents((prev) => ({ ...prev, [path]: content }));
  } catch (error) {
    handlers.addLog(
      "error",
      `Failed to fetch file ${path}: ${error instanceof Error ? error.message : String(error)}`,
    );
  } finally {
    pendingFetchesRef.current.delete(path);
  }
};

export const fetchProjectFiles = async (
  projectId: string,
  handlers: FileServiceHandlers,
  metadataRef: React.RefObject<Record<string, string>>,
  fileContentsRef: React.RefObject<Record<string, string>>,
  pendingFetchesRef: React.RefObject<Set<string>>,
  filesErrorLoggedRef: React.RefObject<boolean>,
): Promise<void> => {
  try {
    const headers = await handlers.getAuthHeaders();
    const apiBaseUrl = handlers.getApiBaseUrl();
    const response = await fetch(`${apiBaseUrl}/projects/${projectId}/files`, {
      cache: "no-store",
      credentials: "include",
      headers,
    });

    if (!response.ok) {
      if (!filesErrorLoggedRef.current) {
        handlers.addLog(
          "error",
          `Failed to fetch files (status ${response.status})`,
        );
        filesErrorLoggedRef.current = true;
      }
      return;
    }
    filesErrorLoggedRef.current = false;

    const data = await response.json();
    const items: ApiProjectFileEntry[] = Array.isArray(data.files)
      ? data.files
      : [];
    const fileEntries = items.filter(
      (entry): entry is { path: string; updated_at?: string | null } =>
        !!entry && entry.is_dir === false && typeof entry.path === "string",
    );
    const uniquePaths = Array.from(
      new Set(fileEntries.map((entry) => entry.path)),
    ).sort();

    // Set file order first so files appear in the viewer immediately
    // Always call setFileOrder to ensure state updates, even if empty
    handlers.setFileOrder(uniquePaths);

    // Preserve existing file contents for files that still exist
    // Files without content will still show up in fileOrder and filesForViewer
    handlers.setFileContents((prev) => {
      const next: Record<string, string> = {};
      for (const path of uniquePaths) {
        // Only preserve content if it exists - files without content will show as "Loading..."
        if (prev[path] !== undefined) {
          next[path] = prev[path];
        }
      }
      return next;
    });

    const nextMetadata: Record<string, string> = {};
    for (const entry of fileEntries) {
      nextMetadata[entry.path] =
        typeof entry.updated_at === "string" ? entry.updated_at : "";
    }
    const previousMetadata = metadataRef.current;
    metadataRef.current = nextMetadata;

    for (const entry of fileEntries) {
      const updatedAt =
        typeof entry.updated_at === "string" ? entry.updated_at : "";
      const existingStamp = previousMetadata[entry.path] ?? "";
      const currentContents = handlers.getFileContents();
      const hasContent = currentContents[entry.path] !== undefined;
      if (!hasContent || existingStamp !== updatedAt) {
        await fetchFileContent(
          projectId,
          entry.path,
          handlers,
          pendingFetchesRef,
        );
      }
    }
  } catch (error) {
    if (!filesErrorLoggedRef.current) {
      handlers.addLog(
        "error",
        `Failed to fetch files: ${error instanceof Error ? error.message : String(error)}`,
      );
      filesErrorLoggedRef.current = true;
    }
  }
};
