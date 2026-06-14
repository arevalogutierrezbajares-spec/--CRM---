"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";

export function McpConnectSnippet({ command }: { command: string }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(command);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard blocked — user can still select the text manually.
    }
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <code className="flex-1 overflow-x-auto whitespace-nowrap rounded-md bg-[var(--muted)] px-3 py-2 text-xs">
          {command}
        </code>
        <Button type="button" variant="outline" size="sm" onClick={copy}>
          {copied ? "Copied" : "Copy"}
        </Button>
      </div>
      <p className="text-xs text-[var(--muted-foreground)]">
        Run this in your terminal, then type{" "}
        <code className="rounded bg-[var(--muted)] px-1">/mcp</code> in Claude Code
        and authenticate in the browser.
      </p>
    </div>
  );
}
