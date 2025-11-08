"use client"

import { useState, useRef, useEffect } from "react"
import Link from "next/link"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Card } from "@/components/ui/card"
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@/components/ui/resizable"
import { Code2, Eye } from "lucide-react"
import { Button } from "@/components/ui/button"
import { MetaGPTLogo } from "@/components/social-icons"
import { CodeViewer } from "@/components/code-viewer"
import { PreviewWindow } from "@/components/preview-window"
import { useProjectContext } from "@/contexts/project-context"
import { ConversationPanel } from "@/components/conversation-panel"
import { UserMenu } from "@/components/user-menu"
import { useSession } from "@/lib/auth-client"

export default function Home() {
  const {
    prompt,
    setPrompt,
    isGenerating,
    messages,
    activeTab,
    setActiveTab,
    previewUrl,
    filesForViewer,
    selectedFile,
    setSelectedFile,
    handleGenerate,
    handleRefreshPreview,
    codeViewerLoading,
  } = useProjectContext()

  const [leftPanelWidth, setLeftPanelWidth] = useState(0)
  const leftPanelRef = useRef<HTMLDivElement>(null)
  const { data: session } = useSession()

  useEffect(() => {
    const updateWidth = () => {
      if (leftPanelRef.current) {
        setLeftPanelWidth(leftPanelRef.current.offsetWidth)
      }
    }

    updateWidth()
    const resizeObserver = new ResizeObserver(updateWidth)
    if (leftPanelRef.current) {
      resizeObserver.observe(leftPanelRef.current)
    }

    return () => resizeObserver.disconnect()
  }, [])

  return (
    <div className="flex flex-col bg-background h-screen">
      {/* Header */}
      <header className="bg-card/95 backdrop-blur">
        <div className="flex h-12 w-full items-center">
          <div
            className="flex items-center gap-0.5 px-2"
            style={{
              width: leftPanelWidth > 0 ? `${leftPanelWidth}px` : "20%",
            }}
          >
            <MetaGPTLogo/>
            <div>
              <p className="text-sm font-semibold text-foreground">MGX</p>
            </div>
          </div>
          <div className="flex-1 flex items-center justify-between gap-4">
            <Tabs value={activeTab} onValueChange={setActiveTab}>
              <TabsList>
                <TabsTrigger value="code" className="gap-2 flex-none">
                  <Code2 className="h-4 w-4 shrink-0" />
                  {activeTab === "code" && <span>Code</span>}
                </TabsTrigger>
                <TabsTrigger value="preview" className="gap-2 flex-none">
                  <Eye className="h-4 w-4 shrink-0" />
                  {activeTab === "preview" && <span>Preview</span>}
                </TabsTrigger>
              </TabsList>
            </Tabs>
            <div className="mr-2">
              {session?.user ? (
                <UserMenu />
              ) : (
                <Button asChild>
                  <Link href="/login">Log in</Link>
                </Button>
              )}
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 min-h-0">
        <ResizablePanelGroup direction="horizontal" className="flex w-full">
          <ResizablePanel
            defaultSize={20}
            minSize={20}
            className="flex min-w-[300px]"
          >
            <div ref={leftPanelRef} className="flex w-full flex-1 flex-col">
              <ConversationPanel
                messages={messages}
                prompt={prompt}
                onPromptChange={setPrompt}
                onSubmit={handleGenerate}
                isGenerating={isGenerating}
              />
            </div>
          </ResizablePanel>
          <ResizableHandle className="bg-transparent" />
          <ResizablePanel
            defaultSize={80}
            minSize={20}
            className="flex pb-2 pr-2"
          >
            <div className="flex w-full flex-1 flex-col ">
              {activeTab === "code" && (
                <Card className="flex flex-1 flex-col border-border/80 bg-card/80 shadow-sm ">
                  <CodeViewer
                    files={filesForViewer}
                    selectedFile={selectedFile}
                    onSelect={(path) => setSelectedFile(path)}
                    loading={codeViewerLoading}
                  />
                </Card>
              )}
              {activeTab === "preview" && (
                <PreviewWindow
                  url={previewUrl}
                  onRefresh={handleRefreshPreview}
                />
              )}
            </div>
          </ResizablePanel>
        </ResizablePanelGroup>
      </main>
    </div>
  )
}
