import { requireUser } from "@/lib/current-user";
import { TopBar } from "@/components/layout/top-bar";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { DbBanner } from "@/components/db-banner";
import { safeRead } from "@/lib/db-status";
import {
  getWorkspaceView,
  renameWorkspace,
  inviteMember,
  revokeInvite,
  removeMember,
} from "./actions";

export default async function WorkspacePage() {
  const user = await requireUser();
  const viewRes = await safeRead(() => getWorkspaceView(), null);
  const view = viewRes.data;

  return (
    <>
      <TopBar email={user.email} displayName={user.displayName} />
      <main className="mx-auto w-full max-w-3xl flex-1 px-6 py-8">
        <header className="mb-6">
          <h1 className="text-2xl font-semibold tracking-tight">Workspace</h1>
          <p className="text-sm text-[var(--muted-foreground)]">
            Everyone here sees the same contacts, projects, milestones, and
            meetings. Reminders are private to each member.
          </p>
        </header>

        {!viewRes.ok && <DbBanner error={viewRes.error} />}
        {view && (
          <>
            <Card className="mb-6">
              <CardHeader>
                <CardTitle>Workspace name</CardTitle>
              </CardHeader>
              <CardContent>
                <form
                  action={async (fd) => {
                    "use server";
                    await renameWorkspace(fd);
                  }}
                  className="flex items-end gap-3"
                >
                  <div className="flex-1 space-y-1.5">
                    <Label htmlFor="ws-name">Name</Label>
                    <Input
                      id="ws-name"
                      name="name"
                      defaultValue={view.workspace.name}
                      disabled={
                        view.myRole !== "owner" && view.myRole !== "admin"
                      }
                    />
                  </div>
                  <Button
                    type="submit"
                    disabled={
                      view.myRole !== "owner" && view.myRole !== "admin"
                    }
                  >
                    Save
                  </Button>
                </form>
              </CardContent>
            </Card>

            <Card className="mb-6">
              <CardHeader>
                <CardTitle>Members ({view.members.length})</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="divide-y divide-[var(--border)]">
                  {view.members.map((m) => (
                    <div
                      key={m.userId}
                      className="flex items-center justify-between py-3"
                    >
                      <div>
                        <div className="font-medium">{m.displayName}</div>
                        <div className="text-sm text-[var(--muted-foreground)]">
                          {m.email}
                          {m.whatsappPhone ? ` · ${m.whatsappPhone}` : ""}
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="rounded-full bg-[var(--muted)] px-2 py-0.5 text-xs uppercase tracking-wide">
                          {m.role}
                        </span>
                        {view.myRole === "owner" && m.userId !== user.id && (
                          <form
                            action={async (fd) => {
                              "use server";
                              await removeMember(fd);
                            }}
                          >
                            <input type="hidden" name="userId" value={m.userId} />
                            <Button type="submit" variant="ghost" size="sm">
                              Remove
                            </Button>
                          </form>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            <Card className="mb-6">
              <CardHeader>
                <CardTitle>Invite by email</CardTitle>
              </CardHeader>
              <CardContent>
                {view.myRole === "owner" || view.myRole === "admin" ? (
                  <form
                    action={async (fd) => {
                      "use server";
                      await inviteMember(fd);
                    }}
                    className="flex flex-col gap-3 sm:flex-row sm:items-end"
                  >
                    <div className="flex-1 space-y-1.5">
                      <Label htmlFor="invite-email">Email</Label>
                      <Input
                        id="invite-email"
                        type="email"
                        name="email"
                        placeholder="partner@example.com"
                        required
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="invite-role">Role</Label>
                      <select
                        id="invite-role"
                        name="role"
                        defaultValue="member"
                        className="h-9 rounded-md border border-[var(--border)] bg-[var(--background)] px-2 text-sm"
                      >
                        <option value="member">Member</option>
                        <option value="admin">Admin</option>
                      </select>
                    </div>
                    <Button type="submit">Send invite</Button>
                  </form>
                ) : (
                  <p className="text-sm text-[var(--muted-foreground)]">
                    Only owners and admins can invite.
                  </p>
                )}
              </CardContent>
            </Card>

            {view.invites.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle>Pending invites</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="divide-y divide-[var(--border)]">
                    {view.invites
                      .filter((i) => !i.acceptedAt)
                      .map((i) => (
                        <div
                          key={i.id}
                          className="flex items-center justify-between py-3"
                        >
                          <div>
                            <div className="font-medium">{i.email}</div>
                            <div className="text-xs text-[var(--muted-foreground)]">
                              {i.role} · expires{" "}
                              {new Date(i.expiresAt).toLocaleDateString()} ·
                              link: <code>/accept?token={i.token}</code>
                            </div>
                          </div>
                          {(view.myRole === "owner" ||
                            view.myRole === "admin") && (
                            <form
                              action={async (fd) => {
                                "use server";
                                await revokeInvite(fd);
                              }}
                            >
                              <input
                                type="hidden"
                                name="inviteId"
                                value={i.id}
                              />
                              <Button
                                type="submit"
                                variant="ghost"
                                size="sm"
                              >
                                Revoke
                              </Button>
                            </form>
                          )}
                        </div>
                      ))}
                  </div>
                </CardContent>
              </Card>
            )}
          </>
        )}
      </main>
    </>
  );
}
