"use client"

import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { Card } from "@/components/ui/card"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Loader2, Play, RotateCcw, Code2, Eye } from "lucide-react"
import { CodeViewer } from "@/components/code-viewer"
import { PreviewWindow } from "@/components/preview-window"
import { StatusPanel } from "@/components/status-panel"
import { useGenerationSession } from "@/hooks/use-generation-session"

export default function Home() {
  const {
    prompt,
    setPrompt,
    isGenerating,
    logs,
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
          {/* Left Column - Input & Code */}
          <div className="flex flex-col gap-6">
            {/* Prompt Input */}
            <Card className="p-6">
              <h2 className="mb-4 text-lg font-semibold text-foreground">Describe Your App</h2>
              <Textarea
                placeholder="Example: Build a todo app with React that has add, delete, and mark as complete features..."
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                className="mb-4 min-h-[120px] font-mono text-sm"
                disabled={isGenerating}
              />
              <div className="flex gap-3">
                <Button onClick={handleGenerate} disabled={isGenerating || !prompt.trim()} className="flex-1">
                  {isGenerating ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Generating...
                    </>
                  ) : (
                    <>
                      <Play className="mr-2 h-4 w-4" />
                      Generate
                    </>
                  )}
                </Button>
                {showRegenerate && (
                  <Button onClick={handleRegenerate} variant="outline" disabled={isGenerating}>
                    <RotateCcw className="mr-2 h-4 w-4" />
                    Regenerate
                  </Button>
                )}
              </div>
            </Card>

            {/* Status Panel */}
            <StatusPanel logs={logs} />
          </div>

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
