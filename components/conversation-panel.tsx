"use client"

import { FormEvent, KeyboardEvent, useMemo } from "react"
import { ConversationMessage, LogEntry } from "@/hooks/use-generation-session"
import { cn } from "@/lib/utils"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Badge } from "@/components/ui/badge"
import {
  CheckCircle2,
  Info,
  Loader2,
  RotateCcw,
  Send,
  Sparkles,
  UserRound,
  XCircle,
} from "lucide-react"

interface ConversationPanelProps {
  messages: ConversationMessage[]
  logs: LogEntry[]
  prompt: string
  onPromptChange: (value: string) => void
  onSubmit: () => void | Promise<void>
  onRegenerate: () => void | Promise<void>
  showRegenerate: boolean
  isGenerating: boolean
}

export function ConversationPanel({
  messages,
  logs,
  prompt,
  onPromptChange,
  onSubmit,
  onRegenerate,
  showRegenerate,
  isGenerating,
}: ConversationPanelProps) {
  const orderedMessages = useMemo(
    () => [...messages].sort((a, b) => a.createdAt - b.createdAt),
    [messages],
  )
  const recentLogs = useMemo(() => logs.slice(-12), [logs])
  const disableSend = isGenerating || !prompt.trim()

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    void onSubmit()
  }

  const handleComposerKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
      event.preventDefault()
      void onSubmit()
    }
  }

  return (
    <Card className="flex h-full min-h-[520px] flex-col overflow-hidden">
      <header className="flex items-center justify-between border-b border-border px-6 py-4">
        <div>
          <p className="text-sm font-semibold text-foreground">Assistant Conversation</p>
          <p className="text-xs text-muted-foreground">Describe what to build and follow along with generation updates.</p>
        </div>
        {showRegenerate && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => void onRegenerate()}
            disabled={isGenerating}
            className="gap-2"
          >
            <RotateCcw className="h-4 w-4" />
            Regenerate
          </Button>
        )}
      </header>

      <ScrollArea className="flex-1 px-6 py-4">
        {orderedMessages.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center rounded-lg border border-dashed border-border/80 bg-muted/40 p-8 text-center">
            <Sparkles className="mb-3 h-8 w-8 text-muted-foreground" />
            <p className="text-sm font-medium text-foreground">Share your idea to begin</p>
            <p className="mt-1 max-w-sm text-xs text-muted-foreground">
              Tell the assistant what to build. You will see the conversation and build status appear here.
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {orderedMessages.map((message) => (
              <MessageBubble key={message.id} message={message} />
            ))}
          </div>
        )}
      </ScrollArea>

      <footer className="border-t border-border bg-card/80 px-6 py-4">
        <form onSubmit={handleSubmit} className="space-y-3">
          <Textarea
            value={prompt}
            onChange={(event) => onPromptChange(event.target.value)}
            onKeyDown={handleComposerKeyDown}
            placeholder="Explain the app you want. Press ⌘ + Enter to send."
            disabled={isGenerating}
            className="min-h-[120px] resize-none text-sm"
          />
          <div className="flex items-center justify-between gap-3">
            <p className="text-xs text-muted-foreground">Use Shift + Enter for a new line.</p>
            <div className="flex items-center gap-2">
              {isGenerating && (
                <Badge variant="secondary" className="gap-1">
                  <Loader2 className="h-3 w-3 animate-spin" />
                  Generating
                </Badge>
              )}
              <Button type="submit" disabled={disableSend} className="gap-2">
                <Send className="h-4 w-4" />
                Send
              </Button>
            </div>
          </div>
        </form>
      </footer>

      <div className="border-t border-border bg-muted/30 px-6 py-4">
        <div className="flex items-center justify-between text-xs">
          <span className="font-medium text-muted-foreground uppercase tracking-wide">Activity</span>
          <span className="text-muted-foreground">{recentLogs.length} updates</span>
        </div>
        <div className="mt-3 max-h-36 space-y-2 overflow-y-auto pr-1 text-xs">
          {recentLogs.length === 0 ? (
            <p className="text-muted-foreground">No activity yet.</p>
          ) : (
            recentLogs.map((log, index) => (
              <div
                key={`${log.type}-${index}`}
                className={cn(
                  "flex items-start gap-2 rounded-md border border-transparent bg-card/70 p-3",
                  log.type === "error" && "border-destructive/20 bg-destructive/10 text-destructive",
                  log.type === "success" && "border-green-200/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
                )}
              >
                <LogIcon type={log.type} />
                <span className="font-mono text-[11px] leading-relaxed text-foreground/90 dark:text-foreground">
                  {log.message}
                </span>
              </div>
            ))
          )}
        </div>
      </div>
    </Card>
  )
}

function MessageBubble({ message }: { message: ConversationMessage }) {
  const isUser = message.role === "user"
  return (
    <div className={cn("flex gap-3", isUser ? "justify-end" : "justify-start")}
    >
      {!isUser && (
        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10 text-primary">
          <Sparkles className="h-4 w-4" />
        </div>
      )}
      <div className="max-w-[85%] space-y-2">
        <div
          className={cn(
            "rounded-2xl px-4 py-3 text-sm shadow-sm",
            isUser
              ? "ml-auto bg-primary text-primary-foreground"
              : "border border-border bg-background text-foreground",
          )}
        >
          <p className="whitespace-pre-wrap leading-relaxed">{message.content}</p>
        </div>
        {!isUser && message.status !== "complete" && (
          <Badge variant="outline" className="gap-2 text-[11px]">
            {message.status === "pending" && <Loader2 className="h-3 w-3 animate-spin" />}
            {message.status === "error" && <XCircle className="h-3 w-3" />}
            <span className="capitalize">{message.status}</span>
          </Badge>
        )}
      </div>
      {isUser && (
        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-muted text-muted-foreground">
          <UserRound className="h-4 w-4" />
        </div>
      )}
    </div>
  )
}

function LogIcon({ type }: { type: LogEntry["type"] }) {
  if (type === "success") {
    return <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
  }
  if (type === "error") {
    return <XCircle className="mt-0.5 h-4 w-4 shrink-0" />
  }
  return <Info className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
}
