"use client"

import { useState } from "react"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Card } from "@/components/ui/card"
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "@/components/ui/resizable"
import { SidebarProvider, SidebarInset } from "@/components/ui/sidebar"
import { Code2, Eye } from "lucide-react"
import Image from "next/image"
import { CodeViewer } from "@/components/code-viewer"
import { PreviewWindow } from "@/components/preview-window"
import { useGenerationSession } from "@/hooks/use-generation-session"
import { ConversationPanel } from "@/components/conversation-panel"
import { ProjectsSidebar } from "@/components/projects-sidebar"
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
    loadProject,
    resetForNewChat,
    codeViewerLoading,
  } = useGenerationSession()

  const [leftPanelSize, setLeftPanelSize] = useState(28)

  return (
    <SidebarProvider defaultOpen={false}>
      <ProjectsSidebar onProjectClick={loadProject} onNewChat={resetForNewChat} />
      <SidebarInset className="min-w-0 overflow-x-hidden">
        <div className="flex h-screen flex-col bg-background min-w-0 w-full overflow-x-hidden">
          {/* Header */}
          <header className="sticky top-0 z-20 bg-card/95 backdrop-blur min-w-0 w-full">
            <div className="flex h-12 w-full items-center min-w-0">
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
              <div className="flex-1 flex items-center justify-between min-w-0 gap-4">
                <div className="min-w-0">
                  <Tabs value={activeTab} onValueChange={setActiveTab}>
                    <TabsList className="bg-transparent p-0 h-auto">
                      <TabsTrigger value="code" className="gap-2 flex-none">
                        <Code2 className="h-4 w-4 shrink-0" />
                        {activeTab === 'code' && <span>Code</span>}
                      </TabsTrigger>
                      <TabsTrigger value="preview" className="gap-2 flex-none">
                        <Eye className="h-4 w-4 shrink-0" />
                        {activeTab === 'preview' && <span>Preview</span>}
                      </TabsTrigger>
                    </TabsList>
                  </Tabs>
                </div>
                <div className="shrink-0 pr-2">
                  <AuthButton />
                </div>
              </div>
            </div>
          </header>

          {/* Main Content */}
          <main className="flex-1 overflow-hidden min-w-0 overflow-x-hidden">
            <ResizablePanelGroup 
              direction="horizontal" 
              className="flex h-full w-full min-w-0 overflow-x-hidden"
              onLayout={(sizes) => setLeftPanelSize(sizes[0])}
            >
              <ResizablePanel defaultSize={28} minSize={25} maxSize={50} className="flex min-h-0 h-full min-w-0">
                <div className="flex w-full flex-1 flex-col h-full min-w-0 overflow-hidden">
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
              <ResizablePanel defaultSize={72} minSize={40} className="flex min-h-0 h-full min-w-0">
                <div className="flex w-full flex-1 flex-col h-full min-w-0 overflow-hidden">
                  <Card className="flex flex-1 flex-col overflow-hidden border-border/80 bg-card/80 shadow-sm h-full min-w-0">
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
      </SidebarInset>
    </SidebarProvider>
  )
}
