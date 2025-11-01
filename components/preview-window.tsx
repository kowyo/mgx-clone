"use client"

import { Button } from "@/components/ui/button"
import { RefreshCw, ExternalLink } from "lucide-react"

interface PreviewWindowProps {
  url: string
  onRefresh: () => void
}

export function PreviewWindow({ url, onRefresh }: PreviewWindowProps) {
  if (!url) {
    return (
      <div className="flex h-full items-center justify-center text-muted-foreground">
        <div className="text-center">
          <ExternalLink className="mx-auto mb-3 h-12 w-12 opacity-50" />
          <p className="text-sm">No preview available</p>
          <p className="mt-1 text-xs">Generate an app to see the preview</p>
        </div>
      </div>
    )
  }

  return (
    <div className="flex h-full flex-col">
      {/* Preview Toolbar */}
      <div className="flex items-center justify-between border-b border-border bg-muted/30 px-4 py-2">
        <div className="flex items-center gap-2">
          <span className="ml-3 font-mono text-xs text-muted-foreground">{url}</span>
        </div>
        <div className="flex gap-2">
          <Button size="sm" variant="ghost" onClick={onRefresh}>
            <RefreshCw className="h-4 w-4" />
          </Button>
          <Button size="sm" variant="ghost" asChild>
            <a
              href={url}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1"
            >
              <ExternalLink className="h-4 w-4" />
            </a>
          </Button>
        </div>
      </div>

      {/* Preview Iframe */}
      <div className="flex-1 bg-white">
        <iframe
          src={url}
          className="h-full w-full border-0"
          title="App Preview"
          sandbox="allow-scripts allow-same-origin allow-forms"
        />
      </div>
    </div>
  )
}
