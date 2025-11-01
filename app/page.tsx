"use client"

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Card } from "@/components/ui/card"
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
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b border-border bg-card">
        <div className="container mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary">
                <Code2 className="h-5 w-5 text-primary-foreground" />
              </div>
              <h1 className="text-xl font-semibold text-foreground">MGX</h1>
              <span className="text-sm text-muted-foreground">Best AI code generator</span>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="container mx-auto px-6 py-8">
        <div className="grid gap-6 lg:grid-cols-2">
          {/* Left Column - Conversation */}
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

          {/* Right Column - Code & Preview */}
          <div className="flex flex-col">
            <Card className="flex-1 overflow-hidden">
              <Tabs value={activeTab} onValueChange={setActiveTab} className="h-full">
                <div className="border-b border-border px-6 pt-4">
                  <TabsList className="w-full justify-start">
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

                <TabsContent value="code" className="h-[calc(100vh-280px)] p-0">
                  <CodeViewer
                    files={filesForViewer}
                    selectedFile={selectedFile}
                    onSelect={(path) => setSelectedFile(path)}
                    loading={codeViewerLoading}
                  />
                </TabsContent>

                <TabsContent value="preview" className="h-[calc(100vh-280px)] p-0">
                  <PreviewWindow url={previewUrl} onRefresh={handleRefreshPreview} />
                </TabsContent>
              </Tabs>
            </Card>
          </div>
        </div>
      </main>
    </div>
  )
}
