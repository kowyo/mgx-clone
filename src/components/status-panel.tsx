"use client";

import { Card } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { CheckCircle2, XCircle, Info, Terminal } from "lucide-react";
import { cn } from "@/lib/utils";

interface StatusPanelProps {
  logs: Array<{ type: "info" | "error" | "success"; message: string }>;
}

export function StatusPanel({ logs }: StatusPanelProps) {
  return (
    <Card className="flex flex-col">
      <div className="border-b border-border px-6 py-3">
        <div className="flex items-center gap-2">
          <Terminal className="h-4 w-4 text-muted-foreground" />
          <h3 className="text-sm font-semibold text-foreground">Status</h3>
        </div>
      </div>
      <ScrollArea className="h-[200px]">
        <div className="p-4">
          {logs.length === 0 ? (
            <p className="text-sm text-muted-foreground">No activity yet</p>
          ) : (
            <div className="space-y-2">
              {logs.map((log, index) => (
                <div
                  key={index}
                  className={cn(
                    "flex items-start gap-3 rounded-md p-3 text-sm",
                    log.type === "error" &&
                      "bg-destructive/10 text-destructive",
                    log.type === "success" &&
                      "bg-green-500/10 text-green-700 dark:text-green-400",
                    log.type === "info" && "bg-muted text-foreground",
                  )}
                >
                  {log.type === "error" && (
                    <XCircle className="mt-0.5 h-4 w-4 shrink-0" />
                  )}
                  {log.type === "success" && (
                    <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
                  )}
                  {log.type === "info" && (
                    <Info className="mt-0.5 h-4 w-4 shrink-0" />
                  )}
                  <span className="font-mono text-xs leading-relaxed">
                    {log.message}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </ScrollArea>
    </Card>
  );
}
