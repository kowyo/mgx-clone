"use client"

import {
  WebPreview,
  WebPreviewBody,
  WebPreviewNavigation,
  WebPreviewNavigationButton,
  WebPreviewUrl,
} from "@/components/ai-elements/web-preview"
import { RefreshCw, ExternalLink } from "lucide-react"

interface PreviewWindowProps {
  url: string
  onRefresh: () => void
}

export function PreviewWindow({ url, onRefresh }: PreviewWindowProps) {
  if (!url) {
    return (
      <div className="flex h-full items-center justify-center text-muted-foreground min-w-0 w-full">
        <div className="text-center">
          <ExternalLink className="mx-auto mb-3 h-12 w-12 opacity-50" />
          <p className="text-sm">No preview available</p>
          <p className="mt-1 text-xs">Generate an app to see the preview</p>
        </div>
      </div>
    )
  }

  const handleOpenExternal = () => {
    window.open(url, "_blank", "noopener,noreferrer")
  }

  return (
    <WebPreview defaultUrl={url} className="h-full min-w-0 w-full">
      <WebPreviewNavigation>
        <WebPreviewUrl />
        <WebPreviewNavigationButton
          onClick={onRefresh}
          tooltip="Refresh preview"
        >
          <RefreshCw className="h-4 w-4" />
        </WebPreviewNavigationButton>
        <WebPreviewNavigationButton
          onClick={handleOpenExternal}
          tooltip="Open in new tab"
        >
          <ExternalLink className="h-4 w-4" />
        </WebPreviewNavigationButton>
      </WebPreviewNavigation>
      <WebPreviewBody src={url} className="rounded-b-lg" />
    </WebPreview>
  )
}
