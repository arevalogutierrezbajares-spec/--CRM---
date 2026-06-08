import { headers } from "next/headers";
import { requireUser } from "@/lib/current-user";
import { TopBar } from "@/components/layout/top-bar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { DbBanner } from "@/components/db-banner";
import { safeRead } from "@/lib/db-status";
import { requestOrigin } from "@/lib/mcp/origin";
import {
  getProfile,
  updateProfile,
  listMcpConnections,
  revokeMcpConnection,
} from "./actions";
import { McpConnectSnippet } from "./mcp-connect-snippet";

const COMMON_TZ = [
  "America/New_York",
  "America/Chicago",
  "America/Denver",
  "America/Los_Angeles",
  "America/Caracas",
  "America/Bogota",
  "America/Mexico_City",
  "Europe/Madrid",
  "Europe/London",
];

export default async function ProfilePage() {
  const user = await requireUser();
  const profileRes = await safeRead(() => getProfile(), null);
  const profile = profileRes.data;

  const origin = requestOrigin(await headers());
  const mcpCommand = `claude mcp add --transport http agb-crm ${origin}/api/mcp`;
  const connectionsRes = await safeRead(() => listMcpConnections(), []);
  const connections = connectionsRes.data ?? [];

  async function action(formData: FormData) {
    "use server";
    await updateProfile(formData);
  }

  async function revokeAction(formData: FormData) {
    "use server";
    const id = String(formData.get("id") ?? "");
    if (id) await revokeMcpConnection(id);
  }

  return (
    <>
      <TopBar email={user.email} displayName={user.displayName} />
      <main className="mx-auto w-full max-w-2xl flex-1 px-6 py-8">
        <header className="mb-6">
          <h1 className="text-2xl font-semibold tracking-tight">Profile</h1>
          <p className="text-sm text-[var(--muted-foreground)]">
            Display name + timezone. Timezone drives This-Week rollups and AI
            briefing send time.
          </p>
        </header>

        {!profileRes.ok && <DbBanner error={profileRes.error} />}

        <Card>
          <CardHeader>
            <CardTitle>You</CardTitle>
          </CardHeader>
          <CardContent>
            <form action={action} className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="email">Email</Label>
                <Input id="email" value={user.email} disabled />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="displayName">Display name</Label>
                <Input
                  id="displayName"
                  name="displayName"
                  required
                  defaultValue={profile?.displayName ?? user.displayName}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="timezone">Timezone</Label>
                <Input
                  id="timezone"
                  name="timezone"
                  list="tz-list"
                  required
                  defaultValue={profile?.timezone ?? "America/New_York"}
                />
                <datalist id="tz-list">
                  {COMMON_TZ.map((tz) => (
                    <option key={tz} value={tz} />
                  ))}
                </datalist>
                <p className="text-xs text-[var(--muted-foreground)]">
                  IANA tz name (e.g. America/New_York, America/Caracas).
                </p>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="whatsappPhone">WhatsApp number</Label>
                <Input
                  id="whatsappPhone"
                  name="whatsappPhone"
                  placeholder="+1 305 555 0123"
                  defaultValue={profile?.whatsappPhone ?? ""}
                />
                <p className="text-xs text-[var(--muted-foreground)]">
                  Include country code. Texting the workspace’s WhatsApp number
                  from this phone lets the AI assistant act on your behalf in
                  the shared workspace. Reminders fire here too.
                </p>
              </div>
              <div className="flex justify-end border-t border-[var(--border)] pt-4">
                <Button type="submit">Save profile</Button>
              </div>
            </form>
          </CardContent>
        </Card>

        <Card className="mt-6">
          <CardHeader>
            <CardTitle>Claude Code (MCP)</CardTitle>
          </CardHeader>
          <CardContent className="space-y-5">
            <p className="text-sm text-[var(--muted-foreground)]">
              Connect Claude Code to this CRM to pull your workspace in as context
              and add contacts, touches, meetings, tasks, and notes from your
              terminal. Everything stays scoped to{" "}
              <strong>{user.displayName}</strong> in this workspace.
            </p>

            <McpConnectSnippet command={mcpCommand} />

            <div className="space-y-2 border-t border-[var(--border)] pt-4">
              <h3 className="text-sm font-medium">Connected</h3>
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
                        <p className="truncate text-sm">
                          {c.clientName ?? "Claude Code"}
                        </p>
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
          </CardContent>
        </Card>
      </main>
    </>
  );
}
