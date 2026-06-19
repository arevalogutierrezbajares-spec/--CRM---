import Link from "next/link";
import { headers } from "next/headers";
import { Headphones, Plug } from "lucide-react";
import { requireUser } from "@/lib/current-user";
import { TopBar } from "@/components/layout/top-bar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ChangePasswordCard } from "@/components/settings/change-password-card";
import { QuoteSettingsCard } from "@/components/settings/quote-settings-card";
import { ConfigSection } from "@/components/settings/config-section";
import { CallCaptureConfig } from "@/components/settings/call-capture-config";
import { McpConfig } from "@/components/settings/mcp-config";
import { getWorkspaceCaptureSettings } from "@/db/queries/capture-sessions";
import { getLatestHelperRelease } from "@/lib/capture/downloads";
import { requestOrigin } from "@/lib/mcp/origin";
import { safeRead } from "@/lib/db-status";
import { listMcpConnections, revokeMcpConnection } from "./actions";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const user = await requireUser();

  // Call Capture
  const captureSettings = (
    await safeRead(() => getWorkspaceCaptureSettings(user.workspaceId), {
      retentionDays: 30,
      storeCallAudio: true,
    })
  ).data;
  const release = await getLatestHelperRelease().catch(() => null);
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "your CRM URL";

  // MCP
  const origin = requestOrigin(await headers());
  const mcpCommand = `claude mcp add --transport http agb-crm-mcp ${origin}/api/mcp`;
  const connections = (await safeRead(() => listMcpConnections(), [])).data ?? [];

  async function revokeMcpAction(formData: FormData) {
    "use server";
    const id = String(formData.get("id") ?? "");
    if (id) await revokeMcpConnection(id);
  }

  return (
    <>
      <TopBar email={user.email} displayName={user.displayName} />
      <main className="mx-auto w-full max-w-2xl flex-1 px-6 py-8">
        <header className="mb-6">
          <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
        </header>

        {/* Configurations — expandable integration setup */}
        <section className="mb-8">
          <h2 className="mb-1 text-xs font-semibold uppercase tracking-wider text-[var(--muted-foreground)]">
            Configurations
          </h2>
          <p className="mb-3 text-sm text-[var(--muted-foreground)]">
            Connect the CRM to your Mac and to Claude. Expand a section to set it
            up.
          </p>
          <div className="space-y-3">
            <ConfigSection
              title="Call Capture"
              description="Record & transcribe both sides of your calls from your Mac."
              icon={<Headphones className="h-5 w-5" />}
            >
              <CallCaptureConfig
                download={release}
                siteUrl={siteUrl}
                retentionDays={captureSettings.retentionDays}
                storeCallAudio={captureSettings.storeCallAudio}
              />
            </ConfigSection>

            <ConfigSection
              title="Claude · MCP"
              description="Operate the CRM from Claude Code or the Claude Desktop connector."
              icon={<Plug className="h-5 w-5" />}
              badge={
                connections.length > 0 ? (
                  <span className="flex-none rounded-full bg-emerald-500/15 px-2 py-0.5 text-xs font-medium text-emerald-700">
                    {connections.length} connected
                  </span>
                ) : null
              }
            >
              <McpConfig
                command={mcpCommand}
                origin={origin}
                displayName={user.displayName}
                connections={connections}
                revokeAction={revokeMcpAction}
              />
            </ConfigSection>
          </div>
        </section>

        {/* Account */}
        <section>
          <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-[var(--muted-foreground)]">
            Account
          </h2>
          <div className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Profile</CardTitle>
              </CardHeader>
              <CardContent>
                <Link className="text-sm underline" href="/profile">
                  Display name, timezone →
                </Link>
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>Tags</CardTitle>
              </CardHeader>
              <CardContent>
                <Link className="text-sm underline" href="/tags">
                  Manage custom tags →
                </Link>
              </CardContent>
            </Card>
            <QuoteSettingsCard />
            <ChangePasswordCard />
          </div>
        </section>
      </main>
    </>
  );
}
