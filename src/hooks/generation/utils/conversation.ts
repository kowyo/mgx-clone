import type { ConversationMessage, ConversationStatus } from "../types"

export const createMessageId = () => {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID()
  }
  return `msg_${Math.random().toString(36).slice(2, 10)}_${Date.now()}`
}

export const beginConversationTurn = (
  userContent: string,
  assistantIntro = "",
  projectId?: string | null,
): { userMessage: ConversationMessage; assistantMessage: ConversationMessage } | null => {
  const trimmed = userContent.trim()
  if (!trimmed) {
    return null
  }
  const timestamp = Date.now()
  const userMessage: ConversationMessage = {
    id: createMessageId(),
    role: "user",
    content: trimmed,
    status: "complete",
    createdAt: timestamp,
    updatedAt: timestamp,
    projectId: projectId ?? null,
  }
  const assistantMessage: ConversationMessage = {
    id: createMessageId(),
    role: "assistant",
    content: assistantIntro,
    status: "pending",
    createdAt: timestamp,
    updatedAt: timestamp,
    projectId: projectId ?? null,
  }
  return { userMessage, assistantMessage }
}

export const updateMessage = (
  message: ConversationMessage,
  patch: Partial<ConversationMessage> | ((message: ConversationMessage) => Partial<ConversationMessage>),
): ConversationMessage => {
  const next = typeof patch === "function" ? patch(message) : patch
  const status: ConversationStatus = next.status ?? message.status
  return {
    ...message,
    ...next,
    status,
    updatedAt: Date.now(),
  }
}

