"use client";

import { useState, useMemo } from "react";
import { ChevronRight, File, Folder, FolderOpen } from "lucide-react";
import { cn } from "@/lib/utils";

interface FileTreeItem {
  name: string;
  path: string;
  type: "file" | "folder";
  children?: Record<string, FileTreeItem>;
  isOpen?: boolean;
}

interface FileTreeProps {
  files: Array<{ path: string; content?: string }>;
  selectedFile: string | null;
  onSelect: (path: string) => void;
}

// Transform flat file paths into a tree structure
function buildFileTree(files: Array<{ path: string }>): FileTreeItem[] {
  const root: Record<string, FileTreeItem> = {};

  for (const file of files) {
    const parts = file.path.split("/").filter(Boolean);
    let current = root;

    for (let i = 0; i < parts.length; i++) {
      const part = parts[i];
      const isFile = i === parts.length - 1;
      const path = parts.slice(0, i + 1).join("/");

      if (!current[part]) {
        current[part] = {
          name: part,
          path,
          type: isFile ? "file" : "folder",
          children: isFile ? undefined : {},
        };
      }

      if (!isFile && current[part].children) {
        current = current[part].children as Record<string, FileTreeItem>;
      }
    }
  }

  const sortItems = (items: Record<string, FileTreeItem>): FileTreeItem[] => {
    return Object.values(items).sort((a, b) => {
      if (a.type !== b.type) {
        return a.type === "folder" ? -1 : 1;
      }
      return a.name.localeCompare(b.name);
    });
  };

  return sortItems(root);
}

interface TreeNodeProps {
  item: FileTreeItem;
  level: number;
  selectedFile: string | null;
  onSelect: (path: string) => void;
  expandedItems: Set<string>;
  onToggleExpand: (path: string) => void;
}

function TreeNode({
  item,
  level,
  selectedFile,
  onSelect,
  expandedItems,
  onToggleExpand,
}: TreeNodeProps) {
  const isExpanded = expandedItems.has(item.path);
  const isFile = item.type === "file";
  const isSelected = selectedFile === item.path;

  const children = item.children ? Object.values(item.children) : [];

  return (
    <div>
      <div
        className={cn(
          "flex items-center gap-1 px-2 py-1.5 text-sm rounded-md transition-colors cursor-pointer group",
          isSelected && isFile
            ? "bg-primary text-primary-foreground"
            : "hover:bg-muted",
        )}
        style={{ marginLeft: `${level * 16}px` }}
        onClick={() => {
          if (isFile) {
            onSelect(item.path);
          } else {
            onToggleExpand(item.path);
          }
        }}
      >
        {!isFile && (
          <ChevronRight
            className={cn(
              "h-4 w-4 shrink-0 transition-transform",
              isExpanded && "rotate-90",
            )}
          />
        )}
        {isFile && <div className="w-4" />}

        {isFile ? (
          <File className="h-4 w-4 shrink-0 text-muted-foreground" />
        ) : isExpanded ? (
          <FolderOpen className="h-4 w-4 shrink-0 text-amber-600" />
        ) : (
          <Folder className="h-4 w-4 shrink-0 text-amber-600" />
        )}

        <span className="truncate font-mono text-xs">{item.name}</span>
      </div>

      {!isFile && isExpanded && children.length > 0 && (
        <div>
          {children.map((child) => (
            <TreeNode
              key={child.path}
              item={child}
              level={level + 1}
              selectedFile={selectedFile}
              onSelect={onSelect}
              expandedItems={expandedItems}
              onToggleExpand={onToggleExpand}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export function FileTree({ files, selectedFile, onSelect }: FileTreeProps) {
  const fileTree = useMemo(() => buildFileTree(files), [files]);

  const [expandedItems, setExpandedItems] = useState<Set<string>>(() => {
    // Expand all first-level folders by default
    const expanded = new Set<string>();
    fileTree.forEach((item) => {
      if (item.type === "folder") {
        expanded.add(item.path);
      }
    });
    return expanded;
  });

  const handleToggleExpand = (path: string) => {
    setExpandedItems((prev) => {
      const next = new Set(prev);
      if (next.has(path)) {
        next.delete(path);
      } else {
        next.add(path);
      }
      return next;
    });
  };

  if (files.length === 0) {
    return (
      <div className="flex items-center justify-center h-full text-muted-foreground">
        <p className="text-sm">No files</p>
      </div>
    );
  }

  return (
    <div className="space-y-1">
      {fileTree.map((item) => (
        <TreeNode
          key={item.path}
          item={item}
          level={0}
          selectedFile={selectedFile}
          onSelect={onSelect}
          expandedItems={expandedItems}
          onToggleExpand={handleToggleExpand}
        />
      ))}
    </div>
  );
}
