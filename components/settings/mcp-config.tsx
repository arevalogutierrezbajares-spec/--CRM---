import { Button } from "@/components/ui/button";
import { McpConnectSnippet } from "@/components/settings/mcp-connect-snippet";

type McpConnection = {
  id: string;
  clientName: string | null;
  lastUsedAt: Date | null;
  createdAt: Date;
};

/**
 * MCP setup guide + connection management, rendered inside a Settings →
 * Configurations section. Drive the CRM from Claude Code (CLI) or the Claude
 * Desktop custom connector — both hit the same `/api/mcp` server over OAuth.
 * Migrated here from the Profile page; the connector runbook lives at
 * docs/CLAUDE-DESKTOP-CONNECTOR.md.
 */
export function McpConfig({
  command,
  origin,
  displayName,
  connections,
  revokeAction,
}: {
  command: string;
  origin: string;
  displayName: string;
  connections: McpConnection[];
  revokeAction: (formData: FormData) => Promise<void>;
}) {
  const mcpUrl = `${origin}/api/mcp`;
  return (
    <div className="space-y-6">
      <p className="text-sm leading-relaxed text-[var(--muted-foreground)]">
        Connect Claude to this CRM and operate it in plain language — pull your
        workspace in as context and add contacts, touches, meetings, tasks, and
        notes from your terminal or from any app. Everything stays scoped to{" "}
        <strong>{displayName}</strong> in this workspace. Read tools (find/summary/
        status) plus guarded write tools are exposed; WhatsApp send/post tools are
        deliberately not.
      </p>

      {/* A — Claude Code (CLI) */}
      <Step n={"A"} title="Claude Code (terminal)">
        <p className="mb-3 text-sm text-[var(--muted-foreground)]">
          Run this once, then type{" "}
          <code className="rounded bg-[var(--muted)] px-1">/mcp</code> in Claude
          Code and approve in the browser.
        </p>
        <McpConnectSnippet command={command} />
      </Step>

      {/* B — Claude Desktop connector */}
      <Step n={"B"} title="Claude Desktop (custom connector)">
        <ol className="list-decimal space-y-2 pl-5 text-sm leading-relaxed">
          <li>
            <strong>Claude Desktop → Settings → Connectors → “Add custom
            connector.”</strong>
          </li>
          <li>
            Paste the remote MCP URL:{" "}
            <code className="break-all rounded bg-[var(--muted)] px-1">
              {mcpUrl}
            </code>
            . Leave the OAuth client ID/secret blank — the server self-registers.
          </li>
          <li>
            Claude opens the consent screen in your browser → sign in to the CRM
            and approve. The connector activates and shows up under{" "}
            <strong>Connected</strong> below after its first call.
          </li>
        </ol>
        <p className="mt-3 rounded-md border border-[var(--border)] bg-[var(--muted)]/30 p-3 text-xs text-[var(--muted-foreground)]">
          Tip: make a Claude Desktop <strong>Project</strong> named “Chief of
          Staff”, attach this connector, and tell it to default to read tools and
          confirm before any write. Full runbook (incl. the weekly-briefing
          routine):{" "}
          <code className="break-all">docs/CLAUDE-DESKTOP-CONNECTOR.md</code>.
        </p>
      </Step>

      {/* Connected list */}
      <div className="border-t border-[var(--border)] pt-5">
        <h3 className="mb-2 text-sm font-semibold">Connected</h3>
        {connections.length === 0 ? (
          <p className="text-xs text-[var(--muted-foreground)]">
            No active connections yet.
          </p>
        ) : (
          <ul className="space-y-2">
            {connections.map((c) => (
              <li
                key={c.id}
                className="flex items-center justify-between gap-3 rounded-md border border-[var(--border)] px-3 py-2"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm">{c.clientName ?? "Claude"}</p>
                  <p className="text-xs text-[var(--muted-foreground)]">
                    {c.lastUsedAt
                      ? `Last used ${c.lastUsedAt.toLocaleString()}`
                      : `Connected ${c.createdAt.toLocaleString()}`}
                  </p>
                </div>
                <form action={revokeAction}>
                  <input type="hidden" name="id" value={c.id} />
                  <Button type="submit" variant="outline" size="sm">
                    Revoke
                  </Button>
                </form>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function Step({
  n,
  title,
  children,
}: {
  n: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex gap-3">
      <span className="flex h-7 w-7 flex-none items-center justify-center rounded-full bg-[var(--muted)] text-sm font-semibold text-[var(--foreground)]">
        {n}
      </span>
      <div className="min-w-0 flex-1">
        <h3 className="mb-2 text-sm font-semibold">{title}</h3>
        {children}
      </div>
    </div>
  );
}
