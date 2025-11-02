"use client"

import { useState } from "react"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Card } from "@/components/ui/card"
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "@/components/ui/resizable"
import { Code2, Eye } from "lucide-react"
import Image from "next/image"
import { CodeViewer } from "@/components/code-viewer"
import { PreviewWindow } from "@/components/preview-window"
import { useGenerationSession } from "@/hooks/use-generation-session"
import { ConversationPanel } from "@/components/conversation-panel"
import { ImperativePanelHandle } from "react-resizable-panels"
import { AuthButton } from "@/components/auth-button"

export default function Home() {
  const {
    prompt,
    setPrompt,
    isGenerating,
    logs,
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
  } = useGenerationSession()

  const [leftPanelSize, setLeftPanelSize] = useState(20)

  return (
    <div className="flex h-screen flex-col bg-background">
      {/* Header */}
      <header className="sticky top-0 z-20 bg-card/95 backdrop-blur">
        <div className="flex h-12 w-full items-center">
          <div className="flex items-center gap-3 px-6" style={{ width: `${leftPanelSize}%` }}>
            <Image
              src="/mgx-logo.png"
              alt="MGX Logo"
              width={24}
              height={24}
            />
            <div>
              <p className="text-sm font-semibold text-foreground">MGX</p>
            </div>
          </div>
          {/* Spacer for ResizableHandle */}
          <div className="w-px" />
          <div className="flex-1 flex items-center justify-between">
            <Tabs value={activeTab} onValueChange={setActiveTab}>
              <TabsList className="bg-transparent p-0 h-auto">
                <TabsTrigger value="code" className="gap-2 flex-none">
                  <Code2 className="h-4 w-4" />
                  {activeTab === 'code' && <span>Code</span>}
                </TabsTrigger>
                <TabsTrigger value="preview" className="gap-2 flex-none">
                  <Eye className="h-4 w-4" />
                  {activeTab === 'preview' && <span>Preview</span>}
                </TabsTrigger>
              </TabsList>
            </Tabs>
            <div className="px-6">
              <AuthButton />
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 overflow-hidden">
        <ResizablePanelGroup 
          direction="horizontal" 
          className="flex h-full w-full"
          onLayout={(sizes) => setLeftPanelSize(sizes[0])}
        >
          <ResizablePanel defaultSize={20} minSize={20} maxSize={50} className="flex min-h-0 h-full">
            <div className="flex w-full flex-1 flex-col h-full">
              <ConversationPanel
                messages={messages}
                logs={logs}
                prompt={prompt}
                onPromptChange={setPrompt}
                onSubmit={handleGenerate}
                isGenerating={isGenerating}
              />
            </div>
          </ResizablePanel>
          <ResizableHandle withHandle className="bg-transparent" />
          <ResizablePanel defaultSize={80} minSize={40} className="flex min-h-0 h-full">
            <div className="flex w-full flex-1 flex-col h-full">
              <Card className="flex flex-1 flex-col overflow-hidden border-border/80 bg-card/80 shadow-sm h-full">
                {activeTab === 'code' && (
                  <CodeViewer
                    files={filesForViewer}
                    selectedFile={selectedFile}
                    onSelect={(path) => setSelectedFile(path)}
                    loading={codeViewerLoading}
                  />
                )}
                {activeTab === 'preview' && (
                  <PreviewWindow url={previewUrl} onRefresh={handleRefreshPreview} />
                )}
              </Card>
            </div>
          </ResizablePanel>
        </ResizablePanelGroup>
      </main>
    </div>
  )
}
