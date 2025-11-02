"use client"

import { ScrollArea } from "@/components/ui/scroll-area"
import { FileCode, ChevronRight } from "lucide-react"
import { cn } from "@/lib/utils"

interface CodeViewerProps {
  files: Array<{ path: string; content?: string }>
  selectedFile: string | null
  onSelect: (path: string) => void
  loading?: boolean
}

export function CodeViewer({ files, selectedFile, onSelect, loading = false }: CodeViewerProps) {
  const currentFile = files.find((f) => f.path === selectedFile)

  if (files.length === 0) {
    return (
      <div className="flex h-full items-center justify-center text-muted-foreground min-w-0 w-full">
        <div className="text-center">
          <FileCode className="mx-auto mb-3 h-12 w-12 opacity-50" />
          <p className="text-sm">{loading ? "Awaiting generated files..." : "No code generated yet"}</p>
          {!loading && <p className="mt-1 text-xs">Enter a prompt and click Generate to start</p>}
        </div>
      </div>
    )
  }

  return (
    <div className="flex h-full min-w-0 w-full">
      {/* File Tree */}
      <div className="w-64 border-r border-border bg-muted/30 shrink-0">
        <ScrollArea className="h-full">
          <div className="p-4">
            <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Files</p>
            <div className="space-y-1">
              {files.map((file) => (
                <button
                  key={file.path}
                  onClick={() => onSelect(file.path)}
                  className={cn(
                    "flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm transition-colors",
                    selectedFile === file.path
                      ? "bg-primary text-primary-foreground"
                      : "text-foreground hover:bg-muted",
                  )}
                >
                  <FileCode className="h-4 w-4 shrink-0" />
                  <span className="truncate font-mono text-xs">{file.path}</span>
                </button>
              ))}
            </div>
          </div>
        </ScrollArea>
      </div>

      {/* Code Display */}
      <div className="flex-1 min-w-0 overflow-hidden">
        <ScrollArea className="h-full">
          {currentFile ? (
            <div className="p-6 min-w-0">
              <div className="mb-4 flex items-center gap-2 text-sm text-muted-foreground min-w-0">
                <ChevronRight className="h-4 w-4 shrink-0" />
                <span className="font-mono truncate">{currentFile.path}</span>
              </div>
              <div className="overflow-x-auto">
                <pre className="rounded-lg bg-muted p-4 text-xs leading-relaxed min-w-0">
                  <code className="font-mono text-foreground whitespace-pre-wrap break-words">
                    {currentFile.content ?? "(Loading content...)"}
                  </code>
                </pre>
              </div>
            </div>
          ) : (
            <div className="flex h-full items-center justify-center text-muted-foreground">
              <p className="text-sm">Select a file to view</p>
            </div>
          )}
        </ScrollArea>
      </div>
    </div>
  )
}
