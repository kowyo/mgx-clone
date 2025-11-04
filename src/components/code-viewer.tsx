"use client";

import { ScrollArea } from "@/components/ui/scroll-area";
import { FileCode } from "lucide-react";
import { FileTree } from "@/components/file-tree";
import { CodeBlockContent } from "@/components/ui/shadcn-io/code-block";
import { useState } from "react";

interface CodeViewerProps {
  files: Array<{ path: string; content?: string }>;
  selectedFile: string | null;
  onSelect: (path: string) => void;
  loading?: boolean;
}

// Helper function to detect language from file extension
function getLanguageFromPath(path: string): string {
  const ext = path.split(".").pop()?.toLowerCase();
  const languageMap: Record<string, string> = {
    ts: "typescript",
    tsx: "tsx",
    js: "javascript",
    jsx: "jsx",
    py: "python",
    json: "json",
    html: "html",
    css: "css",
    scss: "scss",
    md: "markdown",
    yaml: "yaml",
    yml: "yaml",
    sh: "bash",
    sql: "sql",
    go: "go",
    rs: "rust",
    java: "java",
    c: "c",
    cpp: "cpp",
    rb: "ruby",
    php: "php",
    swift: "swift",
    kt: "kotlin",
    dart: "dart",
    vue: "vue",
    svelte: "svelte",
  };
  return languageMap[ext || ""] || "text";
}

export function CodeViewer({
  files,
  selectedFile,
  onSelect,
  loading = false,
}: CodeViewerProps) {
  const currentFile = files.find((f) => f.path === selectedFile);

  if (files.length === 0) {
    return (
      <div className="flex h-full items-center justify-center text-muted-foreground min-w-0 w-full">
        <div className="text-center">
          <FileCode className="mx-auto mb-3 h-12 w-12 opacity-50" />
          <p className="text-sm">
            {loading ? "Awaiting generated files..." : "No code generated yet"}
          </p>
          {!loading && (
            <p className="mt-1 text-xs">
              Enter a prompt and click Generate to start
            </p>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full min-w-0 w-full">
      {/* File Tree */}
      <div className="w-64 border-r border-border bg-muted/30 shrink-0">
        <ScrollArea className="h-full">
          <div className="p-4">
            <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Files
            </p>
            <FileTree
              files={files}
              selectedFile={selectedFile}
              onSelect={onSelect}
            />
          </div>
        </ScrollArea>
      </div>

      {/* Code Display */}
      <div className="flex-1 min-w-0 overflow-hidden">
        <ScrollArea className="h-full">
          {currentFile ? (
            <div className="p-2 min-w-0">
              <div className="mb-4 flex items-center justify-between gap-2 text-sm text-muted-foreground min-w-0"></div>
              <div className="overflow-x-auto">
                <CodeBlockContent
                  language={getLanguageFromPath(currentFile.path) as any}
                  syntaxHighlighting={true}
                  className="rounded-lg bg-muted text-xs leading-relaxed min-w-0 [&>pre]:bg-transparent [&>pre]:p-0 [&>code]:bg-transparent [&>code]:text-foreground [&>code]:whitespace-pre-wrap [&>code]:wrap-break-word"
                >
                  {currentFile.content ?? "(Loading content...)"}
                </CodeBlockContent>
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
  );
}
