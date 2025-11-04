export type LogEntry = { type: "info" | "error" | "success"; message: string };

export type ConversationStatus = "pending" | "complete" | "error";
export type ConversationRole = "user" | "assistant";

export type ConversationMessage = {
  id: string;
  role: ConversationRole;
  content: string;
  status: ConversationStatus;
  createdAt: number;
  updatedAt: number;
  projectId?: string | null;
};

export type ViewerFile = { path: string; content?: string };

export type UseGenerationSessionReturn = {
  prompt: string;
  setPrompt: (value: string) => void;
  isGenerating: boolean;
  logs: LogEntry[];
  messages: ConversationMessage[];
  activeTab: string;
  setActiveTab: (value: string) => void;
  previewUrl: string;
  filesForViewer: ViewerFile[];
  selectedFile: string | null;
  setSelectedFile: (path: string | null) => void;
  handleGenerate: () => Promise<void>;
  handleRefreshPreview: () => void;
  loadProject: (projectId: string) => Promise<void>;
  resetForNewChat: () => void;
  codeViewerLoading: boolean;
};

// Internal types
export type InlineGeneratedFile = { path?: string; content?: string | null };
export type ApiProjectFileEntry = {
  path?: string;
  is_dir?: boolean;
  updated_at?: string | null;
};
