import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { TopBar } from "@/components/layout/top-bar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { requireUser } from "@/lib/current-user";
import { db, schema } from "@/db";
import { acceptInvite } from "../workspace/actions";

const { workspaceInvites, workspaces, users } = schema;

export default async function AcceptInvitePage(props: {
  searchParams: Promise<{ token?: string; result?: string; error?: string }>;
}) {
  const user = await requireUser();
  const sp = await props.searchParams;
  const token = sp.token ?? "";
  const now = new Date();

  // Pre-fetch invite details so we can show the workspace name + inviter and
  // catch obvious problems (expired / wrong email) before the user clicks.
  let invitePreview: {
    workspaceName: string;
    inviterName: string;
    role: string;
    forEmail: string;
    expired: boolean;
    alreadyAccepted: boolean;
    wrongEmail: boolean;
  } | null = null;

  if (token) {
    const [row] = await db
      .select({
        email: workspaceInvites.email,
        role: workspaceInvites.role,
        acceptedAt: workspaceInvites.acceptedAt,
        expiresAt: workspaceInvites.expiresAt,
        workspaceName: workspaces.name,
        inviterName: users.displayName,
      })
      .from(workspaceInvites)
      .innerJoin(workspaces, eq(workspaces.id, workspaceInvites.workspaceId))
      .leftJoin(users, eq(users.id, workspaceInvites.invitedBy))
      .where(eq(workspaceInvites.token, token))
      .limit(1);

    if (row) {
      invitePreview = {
        workspaceName: row.workspaceName,
        inviterName: row.inviterName ?? "A workspace owner",
        role: row.role,
        forEmail: row.email,
        expired: row.expiresAt < now,
        alreadyAccepted: !!row.acceptedAt,
        wrongEmail: row.email.toLowerCase() !== user.email.toLowerCase(),
      };
    }
  }

  async function action() {
    "use server";
    const res = await acceptInvite(token);
    if (res.ok) redirect("/workspace?accepted=1");
    redirect(`/accept?token=${encodeURIComponent(token)}&error=${encodeURIComponent(res.error)}`);
  }

  return (
    <>
      <TopBar email={user.email} displayName={user.displayName} />
      <main className="mx-auto w-full max-w-md flex-1 px-6 py-12">
        <Card>
          <CardHeader>
            <CardTitle>Accept workspace invite</CardTitle>
          </CardHeader>
          <CardContent>
            {!token ? (
              <p className="text-sm text-[var(--muted-foreground)]">
                This page needs a <code>?token=…</code> query parameter from the
                invite link.
              </p>
            ) : !invitePreview ? (
              <p className="text-sm text-[var(--destructive)]">
                This invite link is invalid or no longer exists. Ask the
                workspace owner to send a new one.
              </p>
            ) : invitePreview.alreadyAccepted ? (
              <div className="space-y-3">
                <p className="text-sm">
                  This invite was already accepted. You should be a member of{" "}
                  <strong>{invitePreview.workspaceName}</strong> already.
                </p>
                <Button asChild>
                  <a href="/workspace">Go to workspace</a>
                </Button>
              </div>
            ) : invitePreview.expired ? (
              <p className="text-sm text-[var(--destructive)]">
                This invite has expired. Ask {invitePreview.inviterName} to
                send a fresh one.
              </p>
            ) : invitePreview.wrongEmail ? (
              <div className="space-y-3">
                <p className="text-sm">
                  This invite is for{" "}
                  <strong>{invitePreview.forEmail}</strong>, but you&apos;re
                  signed in as <strong>{user.email}</strong>.
                </p>
                <p className="text-xs text-[var(--muted-foreground)]">
                  Sign out and back in with {invitePreview.forEmail} to accept.
                </p>
              </div>
            ) : (
              <form action={action} className="space-y-4">
                <div className="space-y-2 rounded-md border border-[var(--border)] bg-[var(--bg-surface)] p-4 text-sm">
                  <p>
                    <strong>{invitePreview.inviterName}</strong> invited you to
                    join{" "}
                    <strong>{invitePreview.workspaceName}</strong> as{" "}
                    <span className="rounded-full bg-[var(--muted)] px-2 py-0.5 text-xs uppercase tracking-wide">
                      {invitePreview.role}
                    </span>
                  </p>
                  <p className="text-xs text-[var(--muted-foreground)]">
                    Accepting will switch your current workspace to{" "}
                    {invitePreview.workspaceName}. You&apos;ll see this team&apos;s
                    contacts, projects, milestones, and meetings.
                  </p>
                </div>
                {sp.error && (
                  <p className="text-sm text-[var(--destructive)]">
                    {sp.error}
                  </p>
                )}
                <Button type="submit">Accept invite</Button>
              </form>
            )}
          </CardContent>
        </Card>
      </main>
    </>
  );
}
