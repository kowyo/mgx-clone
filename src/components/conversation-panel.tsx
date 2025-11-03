"use client"

import { FormEvent, ChangeEvent, useMemo, useState } from "react"
import { ConversationMessage, LogEntry } from "@/hooks/use-generation-session"
import { cn } from "@/lib/utils"
import { Card } from "@/components/ui/card"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Badge } from "@/components/ui/badge"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import {
  PromptInput,
  PromptInputTextarea,
  PromptInputToolbar,
  PromptInputSubmit,
} from "@/components/ui/shadcn-io/ai/prompt-input"
import { Message, MessageContent } from "@/components/ui/shadcn-io/ai/message"
import {
  CheckCircle2,
  Info,
  Loader2,
  Sparkles,
  XCircle,
} from "lucide-react"
import { useSession, signIn } from "@/lib/auth-client"
import { GoogleLogo } from "@/components/auth-button"

interface ConversationPanelProps {
  messages: ConversationMessage[]
  logs: LogEntry[]
  prompt: string
  onPromptChange: (value: string) => void
  onSubmit: () => void | Promise<void>
  isGenerating: boolean
}

export function ConversationPanel({
  messages,
  logs,
  prompt,
  onPromptChange,
  onSubmit,
  isGenerating,
}: ConversationPanelProps) {
  const { data: session } = useSession()
  const [showLoginDialog, setShowLoginDialog] = useState(false)
  const orderedMessages = useMemo(
    () => [...messages].sort((a, b) => a.createdAt - b.createdAt),
    [messages],
  )
  const recentLogs = useMemo(() => logs.slice(-12), [logs])
  const disableSend = isGenerating || !prompt.trim()

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    
    // Check if user is logged in
    if (!session?.user) {
      setShowLoginDialog(true)
      return
    }
    
    void onSubmit()
  }

  const handleLogin = () => {
    signIn.social({
      provider: "google",
    })
    setShowLoginDialog(false)
  }

  return (
    <Card className="flex h-full min-h-[520px] flex-col overflow-hidden">
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
          <div className="space-y-2">
            {orderedMessages.map((message) => {
              const isUser = message.role === "user"

              return (
                <Message from={message.role} key={message.id}>
                  <div
                    className={cn(
                      "flex flex-col gap-2",
                      isUser ? "max-w-[80%] items-end" : "w-full items-start",
                    )}
                  >
                    <MessageContent>
                      <p className="whitespace-pre-wrap leading-relaxed">{message.content}</p>
                    </MessageContent>
                    {!isUser && message.status !== "complete" && (
                      <Badge variant="outline" className="gap-2 text-[11px]">
                        {message.status === "pending" && <Loader2 className="h-3 w-3 animate-spin" />}
                        {message.status === "error" && <XCircle className="h-3 w-3" />}
                        <span className="capitalize">{message.status}</span>
                      </Badge>
                    )}
                  </div>
                </Message>
              )
            })}
          </div>
        )}
      </ScrollArea>

      <footer className="border-t border-none p-1">
        <PromptInput onSubmit={handleSubmit}>
          <PromptInputTextarea
            value={prompt}
            onChange={(event: ChangeEvent<HTMLTextAreaElement>) => onPromptChange(event.target.value)}
            placeholder="What do you want to build today?"
            disabled={isGenerating}
          />
          <PromptInputToolbar>
            {isGenerating && (
              <Badge variant="secondary" className="gap-1 mr-auto">
                <Loader2 className="h-3 w-3 animate-spin" />
                Generating
              </Badge>
            )}
            <PromptInputSubmit disabled={disableSend} />
          </PromptInputToolbar>
        </PromptInput>
      </footer>

      <div className="border-t border-none bg-muted/30 px-6 py-4">
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

      <Dialog open={showLoginDialog} onOpenChange={setShowLoginDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Sign In Required</DialogTitle>
            <DialogDescription>
              You need to be signed in to use the app. Please sign in with your Google account to continue.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowLoginDialog(false)}>
              Cancel
            </Button>
            <Button onClick={handleLogin}>
              <GoogleLogo />
              Sign in with Google
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
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
