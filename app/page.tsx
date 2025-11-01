"use client"

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Card } from "@/components/ui/card"
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "@/components/ui/resizable"
import { Code2, Eye } from "lucide-react"
import { CodeViewer } from "@/components/code-viewer"
import { PreviewWindow } from "@/components/preview-window"
import { useGenerationSession } from "@/hooks/use-generation-session"
import { ConversationPanel } from "@/components/conversation-panel"

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
    handleRegenerate,
    handleRefreshPreview,
    showRegenerate,
    codeViewerLoading,
  } = useGenerationSession()

  return (
    <div className="flex min-h-screen flex-col bg-background">
      {/* Header */}
      <header className="sticky top-0 z-20 border-b border-border bg-card/95 backdrop-blur">
        <div className="flex h-16 w-full items-center gap-3 px-6">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary shadow-sm">
            <Code2 className="h-5 w-5 text-primary-foreground" />
          </div>
          <div>
            <p className="text-base font-semibold text-foreground">MGX Studio</p>
            <p className="text-xs text-muted-foreground">Craft and iterate AI-generated apps instantly</p>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 overflow-hidden bg-muted/30 px-6 py-6">
        <ResizablePanelGroup direction="horizontal" className="flex h-full w-full rounded-2xl border border-border/60 bg-card/40 shadow-inner">
          <ResizablePanel defaultSize={35} minSize={20} maxSize={50} className="flex min-h-0">
            <div className="flex w-full flex-1 flex-col p-4">
              <ConversationPanel
                messages={messages}
                logs={logs}
                prompt={prompt}
                onPromptChange={setPrompt}
                onSubmit={handleGenerate}
                onRegenerate={handleRegenerate}
                showRegenerate={showRegenerate}
                isGenerating={isGenerating}
              />
            </div>
          </ResizablePanel>
          <ResizableHandle withHandle className="bg-transparent" />
          <ResizablePanel defaultSize={65} minSize={40} className="flex min-h-0">
            <div className="flex w-full flex-1 flex-col p-4">
              <Card className="flex flex-1 flex-col overflow-hidden border-border/80 bg-card/80 shadow-sm">
                <Tabs value={activeTab} onValueChange={setActiveTab} className="flex h-full flex-col">
                  <div className="border-b border-border/80 bg-card px-6 pt-4">
                    <TabsList className="grid w-full grid-cols-2 justify-start gap-2 bg-transparent p-0">
                      <TabsTrigger value="code" className="gap-2">
                        <Code2 className="h-4 w-4" />
                        Code
                      </TabsTrigger>
                      <TabsTrigger value="preview" className="gap-2" disabled={!previewUrl}>
                        <Eye className="h-4 w-4" />
                        Preview
                      </TabsTrigger>
                    </TabsList>
                  </div>

                  <TabsContent value="code" className="flex flex-1 flex-col p-0">
                    <CodeViewer
                      files={filesForViewer}
                      selectedFile={selectedFile}
                      onSelect={(path) => setSelectedFile(path)}
                      loading={codeViewerLoading}
                    />
                  </TabsContent>

                  <TabsContent value="preview" className="flex flex-1 flex-col p-0">
                    <PreviewWindow url={previewUrl} onRefresh={handleRefreshPreview} />
                  </TabsContent>
                </Tabs>
              </Card>
            </div>
          </ResizablePanel>
        </ResizablePanelGroup>
      </main>
    </div>
  )
}
