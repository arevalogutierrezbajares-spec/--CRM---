import { redirect } from "next/navigation";
import { TopBar } from "@/components/layout/top-bar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { requireUser } from "@/lib/current-user";
import { acceptInvite } from "../workspace/actions";

export default async function AcceptInvitePage(props: {
  searchParams: Promise<{ token?: string; result?: string; error?: string }>;
}) {
  const user = await requireUser();
  const sp = await props.searchParams;
  const token = sp.token ?? "";

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
            ) : (
              <form action={action} className="space-y-4">
                <p className="text-sm">
                  You’re signed in as <strong>{user.email}</strong>. Accepting
                  this invite will switch your current workspace.
                </p>
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
