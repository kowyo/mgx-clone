"use client"

import { FormEvent, ChangeEvent, useMemo, useState } from "react"
import { ConversationMessage, LogEntry } from "@/hooks/use-generation-session"
import { cn } from "@/lib/utils"
import { Card } from "@/components/ui/card"
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
  PromptInputSubmit,
  PromptInputFooter,
  PromptInputTools,
} from "@/components/ai-elements/prompt-input"
import { Message, MessageContent } from "@/components/ai-elements/message"
import {
  Conversation,
  ConversationContent,
  ConversationEmptyState,
  ConversationScrollButton,
} from "@/components/ai-elements/conversation"
import { Loader2, Sparkles, XCircle } from "lucide-react"
import { useSession, signIn } from "@/lib/auth-client"
import { GoogleLogo } from "@/components/auth-button"
import { Streamdown } from "streamdown"

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
    [messages]
  )
  const disableSend = isGenerating || !prompt.trim()

  const handleSubmit = (
    message: { text?: string; files?: any[] },
    event: FormEvent<HTMLFormElement>
  ) => {
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
      <Conversation className="flex-1">
        <ConversationContent>
          {orderedMessages.length === 0 ? (
            <ConversationEmptyState
              title="Share your idea to begin"
              description="Tell the assistant what to build. You will see the conversation and build status appear here."
              icon={<Sparkles className="h-8 w-8" />}
            />
          ) : (
            <div className="space-y-2">
              {orderedMessages.map((message) => {
                const isUser = message.role === "user"

                return (
                  <Message from={message.role} key={message.id}>
                    <div
                      className={cn(
                        "flex flex-col gap-2",
                        isUser ? "max-w-[80%] items-end" : "w-full items-start"
                      )}
                    >
                      {isUser ? (
                        <MessageContent variant="flat">
                          <p className="whitespace-pre-wrap leading-relaxed">
                            {message.content}
                          </p>
                        </MessageContent>
                      ) : (
                        <MessageContent variant="flat">
                          <div className="prose prose-sm dark:prose-invert max-w-none">
                            <Streamdown
                              isAnimating={message.status === "pending"}
                            >
                              {message.content}
                            </Streamdown>
                          </div>
                        </MessageContent>
                      )}
                      {!isUser && message.status !== "complete" && (
                        <Badge variant="outline" className="gap-2 text-[11px]">
                          {message.status === "pending" && (
                            <Loader2 className="h-3 w-3 animate-spin" />
                          )}
                          {message.status === "error" && (
                            <XCircle className="h-3 w-3" />
                          )}
                          <span className="capitalize">{message.status}</span>
                        </Badge>
                      )}
                    </div>
                  </Message>
                )
              })}
            </div>
          )}
        </ConversationContent>
        <ConversationScrollButton />
      </Conversation>

      <PromptInput onSubmit={handleSubmit} className="p-2 relative">
        <PromptInputTextarea
          name="message"
          value={prompt}
          onChange={(e: ChangeEvent<HTMLTextAreaElement>) =>
            onPromptChange(e.target.value)
          }
          disabled={isGenerating}
          placeholder="What do you want to build today?"
        />
        <PromptInputFooter>
          <PromptInputTools>
          </PromptInputTools>
          <PromptInputSubmit disabled={disableSend} status={"ready"} />
        </PromptInputFooter>
      </PromptInput>

      <Dialog open={showLoginDialog} onOpenChange={setShowLoginDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Sign In Required</DialogTitle>
            <DialogDescription>
              You need to be signed in to use the app. Please sign in with your
              Google account to continue.
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
